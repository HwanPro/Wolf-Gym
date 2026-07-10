// src/app/api/test-checkout/route.ts
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

    // Obtener datos del usuario
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

    // Calcular deudas (simplificado para testing)
    const monthlyDebt = 0; // No hay campo de deuda en el perfil
    const dailyDebt = 0; // No hay campo de deudas diarias
    const totalDebt = monthlyDebt + dailyDebt;

    // Simular minutos en el gimnasio (para testing)
    const mockMinutes = Math.floor(Math.random() * 120) + 30; // Entre 30 y 150 minutos

    // Simular registro de salida (sin guardar en BD para testing)
    const mockRecord = {
      id: `test-checkout-${Date.now()}`,
      userId: user.id,
      checkInTime: new Date(Date.now() - mockMinutes * 60 * 1000), // Hace X minutos
      checkOutTime: new Date(),
      type: "gym",
      channel: "test",
      stationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      durationMins: mockMinutes,
    };

    return NextResponse.json({
      ok: true,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      plan: profile.profile_plan || "Sin plan",
      monthlyDebt,
      dailyDebt,
      totalDebt,
      avatarUrl: user.image,
      profileId: profile.profile_id,
      action: "checkout",
      type: "test",
      minutesOpen: mockMinutes,
      message: `✅ MODO PRUEBA - Salida simulada (${mockMinutes} min)`,
      record: mockRecord,
    });
  } catch (error) {
    console.error("Error en test-checkout:", error);
    return NextResponse.json({ ok: false, message: "Error interno del servidor" }, { status: 500 });
  }
}

