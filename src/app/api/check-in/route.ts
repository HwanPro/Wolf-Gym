// src/app/api/check-in/route.ts
import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { autoCloseExpiredAttendances } from "@/lib/attendanceAutoClose";
import { broadcastToRoom } from "@/lib/stream-manager";
import {
  getLimaDayRange,
  getMembershipStatus,
  isGymOpen,
} from "@/domain/attendance/attendance-policy";
export const dynamic = "force-dynamic";

/* ================= Utils ================= */
function normalizeIdentifier(value: string) {
  return String(value || "").replace(/\D/g, "");
}

async function resolveUserIdByIdentifier(identifierRaw?: string | null) {
  const digits = normalizeIdentifier(identifierRaw || "");
  if (!digits) return null;

  const phoneLast9 = digits.length >= 9 ? digits.slice(-9) : "";
  const documentNumber = digits.length === 8 ? digits : "";
  const profileOrConditions: Array<
    { profile_phone: string } | { documentNumber: string }
  > = [];
  if (phoneLast9) {
    profileOrConditions.push(
      { profile_phone: phoneLast9 },
      { profile_phone: `+51${phoneLast9}` },
      { profile_phone: `51${phoneLast9}` },
    );
  }
  if (documentNumber) profileOrConditions.push({ documentNumber });

  if (profileOrConditions.length) {
    const profile = await prisma.clientProfile.findFirst({
      where: { OR: profileOrConditions },
      include: { user: { select: { id: true } } },
    });
    if (profile?.user?.id) return profile.user.id;
  }

  if (phoneLast9) {
    const userByPhone = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: phoneLast9 },
          { phoneNumber: `+51${phoneLast9}` },
          { phoneNumber: `51${phoneLast9}` },
        ],
      },
      select: { id: true },
    });
    if (userByPhone?.id) return userByPhone.id;
  }

  return null;
}

/* ============== Reglas de asistencia ============== */
const REBOUND_SECONDS = 60;      // antirrebote (segundos)
const MAX_ENTRIES_PER_DAY = 2;   // cantidad máxima de entradas por día

type AttendanceIntent = "checkin" | "checkout";

async function closeIfOpenOrCreate(
  userId: string,
  intent: AttendanceIntent,
  now = new Date(),
) {
  await autoCloseExpiredAttendances(now);

  const { start, end } = getLimaDayRange(now);

  const profile = await prisma.clientProfile.findUnique({
    where: { user_id: userId },
    select: {
      profile_end_date: true,
      debt: true,
    },
  });

  if (intent === "checkin" && !isGymOpen(now)) {
    return {
      ok: false as const,
      reason: "gym_closed" as const,
      message: "El gimnasio está cerrado en este horario",
    };
  }

  const membership = getMembershipStatus(profile?.profile_end_date, now);
  if (intent === "checkin" && membership.expired) {
    return {
      ok: false as const,
      reason: "membership_expired" as const,
      message: "Membresía vencida. Renovar antes de marcar entrada",
      endDate: profile?.profile_end_date ?? null,
      monthlyDebt: profile?.debt !== null && profile?.debt !== undefined ? Number(profile.debt) : 0,
    };
  }

  // Antirrebote: si acaban de hacer check-in abierto, ignorar
  const rebound = await prisma.attendance.findFirst({
    where: {
      userId,
      checkInTime: { gte: new Date(now.getTime() - REBOUND_SECONDS * 1000) },
    },
    orderBy: { checkInTime: "desc" },
  });
  if (rebound && !rebound.checkOutTime) {
    return { ok: true as const, ignored: true as const, type: "rebote" as const };
  }

  // ¿Hay sesión abierta hoy?
  const open = await prisma.attendance.findFirst({
    where: { userId, checkInTime: { gte: start, lte: end }, checkOutTime: null },
    orderBy: { checkInTime: "desc" },
  });

  if (open) {
    if (intent === "checkin") {
      return {
        ok: true as const,
        ignored: true as const,
        type: "already_open" as const,
        record: open,
      };
    }

    // Cerrar (checkout)
    const salida = now;
    const durationMins = Math.max(
      0,
      Math.round((salida.getTime() - new Date(open.checkInTime).getTime()) / 60000)
    );
    const updated = await prisma.attendance.update({
      where: { id: open.id },
      data: { checkOutTime: salida, durationMins },
    });
    return { ok: true as const, type: "checkout" as const, record: updated };
  }

  if (intent === "checkout") {
    return {
      ok: false as const,
      reason: "no_open_attendance" as const,
      message: "No hay una entrada abierta para registrar salida",
    };
  }

  // Límite por día (solo contamos check-ins del día)
  const count = await prisma.attendance.count({
    where: { userId, checkInTime: { gte: start, lte: end } },
  });
  if (count >= MAX_ENTRIES_PER_DAY) {
    return {
      ok: false as const,
      reason: "limit_reached" as const,
      message: "Límite de entradas diarias alcanzado",
    };
  }

  // Crear (checkin)
  const created = await prisma.attendance.create({
    data: { userId, checkInTime: now },
  });
  return { ok: true as const, type: "checkin" as const, record: created };
}

/* ============= Perfil / datos a mostrar ============= */
async function getProfileInfo(userId: string, now = new Date()) {
  // User (por si tienes avatar u otros)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, username: true, image: true },
  });

  // ClientProfile (nombres, fechas, deuda, plan)
  const profile = await prisma.clientProfile.findUnique({
    where: { user_id: userId },
    select: {
      profile_id: true,
      profile_first_name: true,
      profile_last_name: true,
      profile_start_date: true,
      profile_end_date: true,
      profile_phone: true,
      profile_plan: true,
      debt: true, // Decimal(10,2) - deuda mensual
    },
  });

  const fullName =
    `${profile?.profile_first_name ?? ""} ${profile?.profile_last_name ?? ""}`
      .trim() ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    user?.username ||
    undefined;

  // Coerce Decimal -> number (o 0 si null/undefined)
  const monthlyDebt =
    profile?.debt !== null && profile?.debt !== undefined
      ? Number(profile.debt)
      : 0;

  // Obtener deudas diarias
  let dailyDebt = 0;
  if (profile?.profile_id) {
    const debts = await prisma.dailyDebt.aggregate({
      where: { clientProfileId: profile.profile_id },
      _sum: { amount: true },
    });
    dailyDebt = Number(debts._sum.amount ?? 0);
  }

  const membership = getMembershipStatus(profile?.profile_end_date, now);

  return {
    fullName,
    plan: profile?.profile_plan ?? null,
    startDate: profile?.profile_start_date ?? null,
    endDate: profile?.profile_end_date ?? null,
    monthlyDebt,
    dailyDebt,
    totalDebt: monthlyDebt + dailyDebt,
    daysLeft: membership.daysLeft,
    membershipExpired: membership.expired,
    avatarUrl: user?.image ?? null,
    profileId: profile?.profile_id ?? null,
  };
}

/* ==================== Handler ==================== */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => ({}));
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const userId = typeof input.userId === "string" ? input.userId : undefined;
    const rawIdentifier = input.identifier ?? input.dni ?? input.document ?? input.phone;
    const identifierRaw = typeof rawIdentifier === "string" ? rawIdentifier : undefined;
    const intent: AttendanceIntent = input.intent === "checkout" ? "checkout" : "checkin";

    // ---- HUELLAS (userId) ----
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json(
          { ok: false, message: "Usuario no encontrado", reason: "not_found" },
          { status: 404 }
        );
      }

      const res = await closeIfOpenOrCreate(user.id, intent);
      if (!res.ok) {
        const info = await getProfileInfo(user.id);
        return NextResponse.json(
          {
            ok: false,
            message: res.message,
            reason: res.reason,
            fullName: info.fullName,
            endDate: info.endDate,
            daysLeft: info.daysLeft,
            monthlyDebt: info.monthlyDebt,
            dailyDebt: info.dailyDebt,
            totalDebt: info.totalDebt,
            avatarUrl: info.avatarUrl,
            profileId: info.profileId,
          },
          { status: 400 }
        );
      }

      const info = await getProfileInfo(user.id);

      const responseData = {
        ok: true,
        userId: user.id,
        fullName: info.fullName,
        plan: info.plan,
        startDate: info.startDate,
        endDate: info.endDate,
        daysLeft: info.daysLeft,
        membershipExpired: info.membershipExpired,
        monthlyDebt: info.monthlyDebt,
        dailyDebt: info.dailyDebt,
        totalDebt: info.totalDebt,
        avatarUrl: info.avatarUrl,
        profileId: info.profileId,
        action: res.type === "checkout" ? "checkout" : res.type === "already_open" ? "already_open" : "checkin",
        type: res.type,
        message:
          res.type === "checkout"
            ? "Salida registrada"
            : res.type === "already_open"
              ? "Entrada ya estaba abierta"
            : res.type === "rebote"
              ? "Registro ya tomado"
              : "Entrada registrada",
        record: "record" in res ? res.record ?? null : null,
        minutesOpen:
          res.type === "checkout" && "record" in res
            ? res.record?.durationMins
            : undefined,
      };

      // Broadcast a todas las salas (o puedes usar una sala específica)
      if (res.type !== "rebote" && res.type !== "already_open") {
        broadcastToRoom("default", responseData);
      }

      return NextResponse.json(responseData);
    }

    // ---- TELÉFONO / DNI ----
    if (identifierRaw) {
      const digits = normalizeIdentifier(identifierRaw);
      const isPhone = digits.length >= 9;
      const isDni = digits.length === 8;
      if (!isPhone && !isDni) {
        return NextResponse.json(
          { ok: false, message: "Ingresa un teléfono de 9 dígitos o DNI de 8 dígitos", reason: "bad_identifier" },
          { status: 400 }
        );
      }

      const userIdFromIdentifier = await resolveUserIdByIdentifier(identifierRaw);
      if (!userIdFromIdentifier) {
        return NextResponse.json(
          { ok: false, message: "Usuario no encontrado", reason: "not_found" },
          { status: 404 }
        );
      }

      const res = await closeIfOpenOrCreate(userIdFromIdentifier, intent);
      if (!res.ok) {
        const info = await getProfileInfo(userIdFromIdentifier);
        return NextResponse.json(
          {
            ok: false,
            message: res.message,
            reason: res.reason,
            fullName: info.fullName,
            endDate: info.endDate,
            daysLeft: info.daysLeft,
            monthlyDebt: info.monthlyDebt,
            dailyDebt: info.dailyDebt,
            totalDebt: info.totalDebt,
            avatarUrl: info.avatarUrl,
            profileId: info.profileId,
          },
          { status: 400 }
        );
      }

      const info = await getProfileInfo(userIdFromIdentifier);

      const responseData = {
        ok: true,
        userId: userIdFromIdentifier,
        fullName: info.fullName,
        plan: info.plan,
        startDate: info.startDate,
        endDate: info.endDate,
        daysLeft: info.daysLeft,
        membershipExpired: info.membershipExpired,
        monthlyDebt: info.monthlyDebt,
        dailyDebt: info.dailyDebt,
        totalDebt: info.totalDebt,
        avatarUrl: info.avatarUrl,
        profileId: info.profileId,
        action: res.type === "checkout" ? "checkout" : res.type === "already_open" ? "already_open" : "checkin",
        type: res.type,
        message:
          res.type === "checkout"
            ? "Salida registrada"
            : res.type === "already_open"
              ? "Entrada ya estaba abierta"
            : res.type === "rebote"
              ? "Registro ya tomado"
              : "Entrada registrada",
        record: "record" in res ? res.record ?? null : null,
        minutesOpen:
          res.type === "checkout" && "record" in res
            ? res.record?.durationMins
            : undefined,
      };

      // Broadcast a todas las salas
      if (res.type !== "rebote" && res.type !== "already_open") {
        broadcastToRoom("default", responseData);
      }

      return NextResponse.json(responseData);
    }

    return NextResponse.json(
      { ok: false, message: "Se requiere 'userId', 'phone' o 'dni'" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("check-in error:", error);
    return NextResponse.json(
      { ok: false, message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
