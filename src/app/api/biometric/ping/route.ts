// app/api/biometric/ping/route.ts
const BASE = process.env.BIOMETRIC_BASE || "http://127.0.0.1:8001";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.authorized) return access.response;
  try {
    const response = await fetch(`${BASE}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return NextResponse.json({ ok: response.ok }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, message: "Servicio biométrico no disponible" }, { status: 503 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
