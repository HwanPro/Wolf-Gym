import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/server/auth/authorization";
import { cancelUnchargedPayment, PaymentConflict, paymentView } from "@/server/payments/online-payment";

export async function POST(request: NextRequest) {
  const access = await authorizeRequest(request, ["admin", "client"]);
  if (!access.authorized) return access.response;
  const input = z.object({ key: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
  try {
    const attempt = await cancelUnchargedPayment(String(access.token.id || access.token.sub || ""), input.data.key);
    return NextResponse.json(paymentView(attempt), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PaymentConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "No se pudo cancelar el intento. Consulta su estado antes de volver a pagar" }, { status: 409 });
  }
}
