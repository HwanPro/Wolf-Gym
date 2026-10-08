import { requireAdmin } from "@/server/auth/authorization";
// src/app/api/check-in/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { autoCloseExpiredAttendances } from "@/lib/attendanceAutoClose";
import { getLimaDayRange, getMembershipStatus } from "@/domain/attendance/attendance-policy";

export const dynamic = "force-dynamic";

// Obtener historial de actividad reciente
export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    await autoCloseExpiredAttendances();

    const { searchParams } = new URL(request.url);
    const room = searchParams.get("room") || "default";
    const limit = Number(searchParams.get("limit") ?? "50");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "El límite debe estar entre 1 y 100" }, { status: 400 });
    }

    // Obtener registros de asistencia del día actual
    const today = new Date();
    const { start: startOfDay, end: endOfDay } = getLimaDayRange(today);

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        OR: [
          { checkInTime: { gte: startOfDay, lte: endOfDay } },
          { checkOutTime: { gte: startOfDay, lte: endOfDay } }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            image: true,
          }
        }
      },
      orderBy: [
        { checkOutTime: 'desc' },
        { checkInTime: 'desc' }
      ],
      take: limit
    });

    // Procesar registros para crear el historial
    const activityLog = [];

    for (const record of attendanceRecords) {
      // Obtener información del perfil
      const profile = await prisma.clientProfile.findUnique({
        where: { user_id: record.userId },
        select: {
          profile_id: true,
          profile_first_name: true,
          profile_last_name: true,
          profile_end_date: true,
          debt: true,
        },
      });

      const fullName =
        `${profile?.profile_first_name ?? ""} ${profile?.profile_last_name ?? ""}`.trim() ||
        `${record.user?.firstName ?? ""} ${record.user?.lastName ?? ""}`.trim() ||
        record.user?.username ||
        "Usuario";

      const monthlyDebt = profile?.debt ? Number(profile.debt) : 0;

      // Obtener deudas diarias
      let dailyDebt = 0;
      if (profile?.profile_id) {
        try {
          const dailyDebts = await (prisma as any).dailyDebt.findMany({
            where: { clientProfileId: profile.profile_id },
          });
          dailyDebt = dailyDebts.reduce((sum: number, debt: any) => sum + Number(debt.amount), 0);
        } catch (error) {
          dailyDebt = 0;
        }
      }

      const daysLeft = getMembershipStatus(profile?.profile_end_date, today).daysLeft;

      // Agregar entrada si existe
      if (record.checkInTime) {
        activityLog.push({
          id: `${record.id}-checkin`,
          timestamp: record.checkInTime,
          fullName,
          action: "checkin",
          avatarUrl: record.user?.image,
          monthlyDebt,
          dailyDebt,
          totalDebt: monthlyDebt + dailyDebt,
          daysLeft,
          profileId: profile?.profile_id,
        });
      }

      // Agregar salida si existe
      if (record.checkOutTime) {
        activityLog.push({
          id: `${record.id}-checkout`,
          timestamp: record.checkOutTime,
          fullName,
          action: "checkout",
          avatarUrl: record.user?.image,
          monthlyDebt,
          dailyDebt,
          totalDebt: monthlyDebt + dailyDebt,
          daysLeft,
          profileId: profile?.profile_id,
          minutesOpen: record.durationMins,
        });
      }
    }

    // Ordenar por timestamp descendente
    activityLog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      ok: true,
      activityLog: activityLog.slice(0, limit),
      room,
    });

  } catch (error) {
    console.error("Error obteniendo historial:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
