import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import type { JWT } from "next-auth/jwt";
import { requestToken } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = (await requestToken(req)) as JWT | null;

    if (!token || !token.id) {
      return NextResponse.json(
        { error: "No autorizado, token inválido o expirado" },
        { status: 401 }
      );
    }

    const userId = token.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        image: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        memberships: { include: { membership: true } },
        attendances: { orderBy: { checkInTime: "desc" }, take: 100 },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json(user, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("❌ Error al obtener el perfil del cliente:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
