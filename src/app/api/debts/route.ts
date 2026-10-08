import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { executeCashAction } from "@/server/cash/cash-service";
import { cashQuote, CashError } from "@/domain/cash/cash-policy";
import { z } from "zod";
const inputSchema = z.object({ clientProfileId: z.string().min(1).max(100), productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(1000).default(1) }).strict();
async function summary(clientProfileId: string) {
  const [aggregate, profile] = await Promise.all([prisma.dailyDebt.aggregate({ where: { clientProfileId }, _sum: { amount: true } }), prisma.clientProfile.findUnique({ where: { profile_id: clientProfileId }, select: { debt: true } })]);
  const dailyDebt = Number(aggregate._sum.amount ?? 0), monthlyDebt = Number(profile?.debt ?? 0);
  return { dailyDebt, monthlyDebt, totalDebt: dailyDebt + monthlyDebt };
}
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const clientProfileId = request.nextUrl.searchParams.get("clientProfileId");
  if (!clientProfileId) return NextResponse.json({ error: "clientProfileId requerido" }, { status: 400 });
  const [dailyDebts, totals] = await Promise.all([prisma.dailyDebt.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" } }), summary(clientProfileId)]);
  return NextResponse.json({ dailyDebts: dailyDebts.map(debt => ({ ...debt, amount: Number(debt.amount), productName: debt.productName ?? "Deuda histórica" })), dailyTotal: totals.dailyDebt, monthlyDebt: totals.monthlyDebt, totalDebt: totals.totalDebt });
}
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  try {
    const input = inputSchema.parse(await request.json());
    const profile = await prisma.clientProfile.findUnique({ where: { profile_id: input.clientProfileId }, select: { user_id: true } });
    if (!profile) throw new CashError("Cliente no encontrado", 404);
    const key = request.headers.get("Idempotency-Key");
    if (!key || !z.string().uuid().safeParse(key).success) throw new CashError("Se requiere Idempotency-Key UUID");
    const previous = await prisma.cashAction.findUnique({ where: { requestKey: `${auth.token.id}:sale:${key}` } });
    if (previous) {
      const saved = previous.result as { result?: { customerId?: string; note?: string; discountPercent?: number; lines?: { productId: string; quantity: number }[] } };
      const sale = saved.result;
      if (sale?.customerId !== profile.user_id || sale.note !== "Venta a crédito desde recepción" || sale.discountPercent !== 0 || sale.lines?.length !== 1 || sale.lines[0].productId !== input.productId || sale.lines[0].quantity !== input.quantity) throw new CashError("La clave ya pertenece a otra operación", 409);
      return NextResponse.json({ message: "Venta a crédito ya registrada", summary: await summary(input.clientProfileId) });
    }
    const session = await prisma.cashSession.findFirst({ where: { registerId: "main", status: "OPEN" } });
    if (!session) throw new CashError("Abra Caja / Ventas antes de registrar productos a crédito", 409);
    const items = [{ productId: input.productId, quantity: input.quantity }];
    const product = await prisma.inventoryItem.findUnique({ where: { item_id: input.productId } });
    if (!product) throw new CashError("Producto no encontrado", 404);
    // Only pricing is prepared here. Stock is checked under the cashier transaction lock,
    // after replaying an existing intent, so retrying the last unit returns its original sale.
    const priced = cashQuote([{ ...product, track_stock: false }], { items, discountPercent: 0 });
    await executeCashAction(String(auth.token.id), "sale", request.headers.get("Idempotency-Key"), { sessionId: session.id, customerId: profile.user_id, items, discountPercent: 0, expectedTotal: priced.totalCents / 100, note: "Venta a crédito desde recepción", payments: [], cashTendered: 0 });
    return NextResponse.json({ message: "Venta a crédito registrada en caja", summary: await summary(input.clientProfileId) });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Seleccione un producto del inventario. Los precios se consultan en la base de datos." }, { status: 400 });
    if (error instanceof CashError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No se pudo registrar el crédito" }, { status: 500 });
  }
}
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  return NextResponse.json({ error: "Registre el cobro o anule la venta con motivo en Caja / Ventas. Eliminar una deuda no registra un pago." }, { status: 409 });
}
