import { requireAdmin } from "@/server/auth/authorization";
// src/app/api/biometric/active-target/route.ts
import { NextRequest, NextResponse } from "next/server";

// Nota: variable de módulo para dev/kiosk local. No persistente.
let currentTarget: { userId?: string; updatedAt?: number } = {};

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  return NextResponse.json({ ok: true, userId: currentTarget.userId ?? null });
}

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const id = typeof body?.userId === "string" && body.userId.length > 0 ? body.userId : undefined;
    currentTarget = { userId: id, updatedAt: Date.now() };
    return NextResponse.json({ ok: true, userId: id ?? null });
  } catch {
    return NextResponse.json({ ok: false, message: "Datos inválidos" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  currentTarget = {};
  return NextResponse.json({ ok: true });
}



