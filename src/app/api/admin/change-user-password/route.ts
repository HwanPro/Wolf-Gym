import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";

export async function POST(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.authorized) return access.response;
  return NextResponse.json({ error: "Usa la recuperación de contraseña o la acción de credenciales del cliente" }, { status: 410 });
}
