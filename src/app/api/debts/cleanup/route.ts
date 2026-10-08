import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
async function preserveLedger(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  return NextResponse.json({ error: "Las deudas y su historial se conservan. Registre el cobro o una anulación individual con motivo." }, { status: 409 });
}
export const POST = preserveLedger;
export const DELETE = preserveLedger;
