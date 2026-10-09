// /app/api/admin/me/route.ts (o donde prefieras)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requestToken } from "@/server/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const token = await requestToken(req);
    if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

    // Busca el usuario admin con profile y solo campos seguros
    const admin = await prisma.user.findUnique({
      where: { id: token.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        image: true,
        role: true,
        profile: {
          select: {
            profile_emergency_phone: true,
          },
        },
      },
    });
    if (!admin) {
      return NextResponse.json(
        { error: "Admin no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(admin, { status: 200 });
  } catch (error) {
    console.error("Error GET /api/admin/me:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
