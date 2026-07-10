// src/app/api/biometric/delete/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";

const BASE = process.env.BIOMETRIC_BASE || "http://127.0.0.1:8001";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id: userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "ID de usuario requerido" },
        { status: 400 }
      );
    }

    // 1. Eliminar de la base de datos
    const deletedFingerprint = await prisma.fingerprint.deleteMany({
      where: { user_id: userId },
    });

    console.log(`[DELETE] Huella eliminada de BD para usuario ${userId}: ${deletedFingerprint.count} registros`);

    // 2. Refrescar cache del servicio C# para que 1:N no conserve huellas eliminadas.
    await fetch(`${BASE}/cache/reload`, { method: "POST", cache: "no-store" }).catch(() => null);

    return NextResponse.json({
      ok: true,
      message: `Huella eliminada correctamente (${deletedFingerprint.count} registros)`,
      deletedCount: deletedFingerprint.count,
    });

  } catch (error) {
    console.error("[DELETE] Error eliminando huella:", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Error interno del servidor al eliminar huella",
      },
      { status: 500 }
    );
  }
}

