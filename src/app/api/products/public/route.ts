import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
export async function GET() {
  const products = await prisma.inventoryItem.findMany({ where: { is_admin_only: false } });
  return NextResponse.json(products.map(product => ({ ...product, item_image_url: product.item_image_url || "/uploads/images/logo2.jpg" })), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  return NextResponse.json({ error: "Registre el cobro en Caja / Ventas" }, { status: 410 });
}
