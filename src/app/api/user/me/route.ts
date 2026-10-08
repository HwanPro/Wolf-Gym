import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requestToken } from "@/server/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const token = await requestToken(request);

    if (!token?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      include: {
        profile: true, // ✅ relación válida con ClientProfile
        memberships: {
          include: {
            membership: true, // incluir detalles del plan
          },
        },
        attendances: {
          orderBy: { checkInTime: "desc" },
          take: 60,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        name: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        image: user.image ?? null,
        role: user.role,
        profile: user.profile,
        memberships: user.memberships,
        attendances: user.attendances,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en GET /api/user/me:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
