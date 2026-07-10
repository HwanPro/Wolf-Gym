// src/app/api/test-checkin/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ ok: false, message: "userId requerido" }, { status: 400 });
    }

    // Obtener datos del usuario sin verificar límites diarios
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ ok: false, message: "Usuario no encontrado" }, { status: 404 });
    }

    const profile = user.profile;
    const today = new Date();
    const endDate = profile.profile_end_date ? new Date(profile.profile_end_date) : null;
    const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))) : 0;

    // Calcular deudas (simplificado para testing)
    const monthlyDebt = 0; // No hay campo de deuda en el perfil
    const dailyDebt = 0; // No calcular deudas diarias para testing
    const totalDebt = monthlyDebt;

    // Simular registro de entrada/salida (sin guardar en BD para testing)
    const mockRecord = {
      id: `test-${Date.now()}`,
      userId: user.id,
      checkInTime: new Date(),
      checkOutTime: null,
      type: "gym",
      channel: "test",
      stationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      durationMins: null,
    };

    return NextResponse.json({
      ok: true,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      plan: profile.profile_plan || "Sin plan",
      startDate: profile.profile_start_date,
      endDate: profile.profile_end_date,
      daysLeft,
      monthlyDebt,
      dailyDebt,
      totalDebt,
      avatarUrl: user.image,
      profileId: profile.profile_id,
      action: "checkin",
      type: "test",
      message: "✅ MODO PRUEBA - Entrada simulada",
      record: mockRecord,
    });
  } catch (error) {
    console.error("Error en test-checkin:", error);
    return NextResponse.json({ ok: false, message: "Error interno del servidor" }, { status: 500 });
  }
}
