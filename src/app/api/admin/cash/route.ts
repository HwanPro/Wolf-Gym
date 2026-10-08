import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { expectedCash, saleInclude } from "@/server/cash/cash-service";
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const date = request.nextUrl.searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(`${date}T00:00:00-05:00`).getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const start = new Date(`${date}T00:00:00-05:00`), end = new Date(start.getTime() + 86400000);
  if (start.toISOString().slice(0, 10) !== date) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const [products, clients, session, sessions, sales, receivables, payments] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: { item_name: "asc" } }),
    prisma.user.findMany({ where: { role: "client" }, select: { id: true, username: true, firstName: true, lastName: true }, orderBy: { username: "asc" } }),
    prisma.cashSession.findFirst({ where: { registerId: "main", status: "OPEN" }, include: { movements: { orderBy: { createdAt: "desc" }, take: 50 } } }),
    prisma.cashSession.findMany({ orderBy: { openedAt: "desc" }, take: 10 }),
    prisma.cashSale.findMany({ where: { createdAt: { gte: start, lt: end } }, include: saleInclude, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.cashSale.findMany({ where: { dueCents: { gt: 0 }, status: { not: "VOIDED" } }, include: saleInclude, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.paymentRecord.groupBy({ by: ["tenderMethod"], where: { cashSaleId: { not: null }, payment_status: "COMPLETED", payment_date: { gte: start, lt: end } }, _sum: { payment_amount: true } }),
  ]);
  const totals = await prisma.cashSale.aggregate({ where: { createdAt: { gte: start, lt: end }, status: { not: "VOIDED" } }, _sum: { totalCents: true, dueCents: true }, _count: true });
  return NextResponse.json({ products, clients, session: session ? { ...session, expectedCents: await expectedCash(prisma, session.id) } : null, sessions, sales, receivables, totals, payments, date }, { headers: { "Cache-Control": "no-store" } });
}
