import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { hashValue } from "@/server/payments/culqi-policy";
import { paymentView } from "@/server/payments/online-payment";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = await authorizeRequest(request, ["admin", "client"]);
  if (!access.authorized) return access.response;
  const key = z.string().uuid().safeParse(request.nextUrl.searchParams.get("key"));
  if (!key.success) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
  const userId = String(access.token.id || access.token.sub || "");
  const attempt = await prisma.onlinePaymentAttempt.findUnique({ where: { id: hashValue(userId + ":" + key.data) } });
  if (!attempt || attempt.userId !== userId) return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 });
  return NextResponse.json(paymentView(attempt), { headers: { "Cache-Control": "no-store" } });
}
