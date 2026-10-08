import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { buildSaleQuote } from "@/domain/sales/sale-policy";
import { culqiConfiguration } from "@/server/payments/culqi-policy";
import { resolveOnlinePlan } from "@/server/payments/online-plan";

const schema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(120), quantity: z.number().int().positive().max(100) })).min(1).max(50).optional(),
  planId: z.string().min(1).max(120).optional(),
}).refine(value => Boolean(value.items) !== Boolean(value.planId));
export async function POST(request: NextRequest) {
  const access = await authorizeRequest(request, ["admin", "client"]);
  if (!access.authorized) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Compra inválida" }, { status: 400 });
  const config = culqiConfiguration();
  if (!config.enabled || (parsed.data.planId && !config.membershipsEnabled)) return NextResponse.json({ error: "Compra online no disponible" }, { status: 503 });
  let total: number;
  if (parsed.data.planId) {
    const plan = await resolveOnlinePlan(prisma, parsed.data.planId);
    if (!plan) return NextResponse.json({ error: "Plan no disponible" }, { status: 409 });
    total = plan.price;
  } else {
    const products = await prisma.inventoryItem.findMany({ where: { item_id: { in: parsed.data.items!.map(item => item.productId) }, is_admin_only: false } });
    const quote = buildSaleQuote(products.map(product => ({ id: product.item_id, name: product.item_name, price: product.item_price, discountPercent: product.item_discount, stock: product.track_stock ? product.item_stock : Number.MAX_SAFE_INTEGER })), parsed.data.items!);
    if (!quote.ok) return NextResponse.json({ error: "Productos no disponibles o stock insuficiente" }, { status: 409 });
    total = quote.grandTotal;
  }
  const amountCents = Math.round(total * 100);
  if (!Number.isFinite(amountCents) || amountCents < 300 || amountCents > 999900) return NextResponse.json({ error: "Total fuera del rango permitido" }, { status: 409 });
  return NextResponse.json({ amountCents, currency: "PEN" }, { headers: { "Cache-Control": "no-store" } });
}
