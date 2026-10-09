import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/server/auth/authorization";
import { culqiConfiguration, onlinePaymentSchema } from "@/server/payments/culqi-policy";
import { PaymentConflict, paymentView, submitOnlinePayment } from "@/server/payments/online-payment";

export async function POST(request: NextRequest) {
  const access = await authorizeRequest(request, ["admin", "client"]);
  if (!access.authorized) return access.response;
  const parsed = onlinePaymentSchema.safeParse(await request.json().catch(() => null));
  const key = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!parsed.success || !key.success) return NextResponse.json({ error: "Datos de pago o identificador del intento inválidos" }, { status: 400 });
  if (!culqiConfiguration().enabled) return NextResponse.json({ error: "Los pagos online no están habilitados" }, { status: 503 });
  const userId = String(access.token.id || access.token.sub || "");
  if (!userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  try {
    const attempt = await submitOnlinePayment(userId, key.data, parsed.data);
    return NextResponse.json(paymentView(attempt), { status: attempt.state === "COMPLETED" ? 200 : attempt.state === "FAILED" ? 402 : 202 });
  } catch (error) {
    if (error instanceof PaymentConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.warn("No se pudo completar la solicitud de pago");
    return NextResponse.json({ error: "No se pudo confirmar el pago. Consulta el estado del intento antes de volver a pagar." }, { status: 503 });
  }
}
