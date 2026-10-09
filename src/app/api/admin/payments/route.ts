import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.authorized) return access.response;
  const query = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), view: z.enum(["pending", "all"]).default("pending") }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ error: "Filtro inválido" }, { status: 400 });
  const { page, view } = query.data;
  const where = view === "pending" ? { state: { in: ["RESERVED", "DISPATCHING", "REQUIRES_3DS", "CHARGED", "REVIEW"] } } : {};
  const [attempts, total] = await Promise.all([
    prisma.onlinePaymentAttempt.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25, select: { id: true, userId: true, state: true, amountCents: true, gatewayMode: true, paymentId: true, chargeId: true, createdAt: true } }),
    prisma.onlinePaymentAttempt.count({ where }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: attempts.map(row => row.userId) } }, select: { id: true, username: true, firstName: true, lastName: true } });
  return NextResponse.json({ page, total, hasNext: page * 25 < total, attempts: attempts.map(row => {
    const user = users.find(user => user.id === row.userId);
    return { ...row, customer: user ? `${user.firstName} ${user.lastName}`.trim() || user.username : "Cliente no disponible" };
  }) }, { headers: { "Cache-Control": "no-store" } });
}
