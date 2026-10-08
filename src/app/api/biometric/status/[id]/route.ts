import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
// src/app/api/biometric/status/[id]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdmin(_req);
  if (!authorization.authorized) return authorization.response;

  const { id } = await ctx.params;

  try {
    const dbFingerprint = await prisma.fingerprint.findFirst({
      where: { user_id: id },
      select: { id: true },
    });
    const hasFingerprint = Boolean(dbFingerprint);

    return NextResponse.json({
      ok: true,
      hasFingerprint,
      inDatabase: hasFingerprint,
      message: hasFingerprint ? "Huella registrada" : "Sin huella registrada",
    });
  } catch (error) {
    console.error("No se pudo consultar el estado de la huella", error);
    return NextResponse.json(
      { ok: false, hasFingerprint: false, message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
