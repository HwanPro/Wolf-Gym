import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/authorization";
import { PaymentConflict, paymentView, reconcileOnlinePayment } from "@/server/payments/online-payment";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin(request);
  if (!access.authorized) return access.response;
  const id = z.string().regex(/^[a-f0-9]{64}$/).safeParse((await params).id);
  const body = z.object({ chargeId: z.string().regex(/^chr_(test|live)_[A-Za-z0-9]+$/).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!id.success || !body.success) return NextResponse.json({ error: "Referencia de pago inválida" }, { status: 400 });
  try {
    return NextResponse.json(paymentView(await reconcileOnlinePayment(id.data, body.data.chargeId)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentConflict ? error.message : "No se pudo verificar el cargo en Culqi; el intento conserva su estado" }, { status: 409 });
  }
}
