// src/app/api/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { autoCloseExpiredAttendances } from "@/lib/attendanceAutoClose";
import { getLimaDayRange } from "@/domain/attendance/attendance-policy";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

// Configurables
const REBOUND_SECONDS = 60;       // antirrebote entre toques
const MAX_ENTRIES_PER_DAY = 2;    // (p.ej. GYM + FULL BODY)

/* =========================
 *         GET
 * ========================= */
export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    await autoCloseExpiredAttendances();

    const records = await prisma.attendance.findMany({
      orderBy: { checkInTime: "desc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            profile: {
              select: {
                profile_id: true,
                profile_plan: true,
                profile_end_date: true,
                debt: true,
              },
            },
          },
        },
      },
    });

    const profileIds = records
      .map((r) => r.user.profile?.profile_id)
      .filter(Boolean) as string[];
    const dailyDebts = profileIds.length
      ? await prisma.dailyDebt.groupBy({
          by: ["clientProfileId"],
          where: { clientProfileId: { in: profileIds } },
          _sum: { amount: true },
        })
      : [];
    const dailyDebtByProfile = new Map(
      dailyDebts.map((debt) => [
        debt.clientProfileId,
        Number(debt._sum.amount || 0),
      ]),
    );

    // Aseguramos userId en la respuesta (por si tu modelo cambia)
    const data = records.map((r) => ({
      id: r.id,
      userId: r.userId,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime ?? null,
      durationMins: r.durationMins ?? null,
      user: {
        id: r.user.id,
        username: r.user.username,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        phoneNumber: r.user.phoneNumber,
      },
      profile: r.user.profile
        ? {
            profileId: r.user.profile.profile_id,
            plan: r.user.profile.profile_plan,
            endDate: r.user.profile.profile_end_date,
            monthlyDebt: Number(r.user.profile.debt || 0),
            dailyDebt: dailyDebtByProfile.get(r.user.profile.profile_id) || 0,
            totalDebt:
              Number(r.user.profile.debt || 0) +
              (dailyDebtByProfile.get(r.user.profile.profile_id) || 0),
          }
        : null,
    }));

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("❌ GET /attendance failed:", err);
    return NextResponse.json(
      { message: "No se pudo obtener la asistencia" },
      { status: 500 }
    );
  }
}

/* =========================
 *         POST
 *   (registro por teléfono)
 * ========================= */
export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    await autoCloseExpiredAttendances();

    const body: unknown = await req.json().catch(() => ({}));
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const rawIdentifier = String(input.identifier || input.dni || input.phone || "");
    const digits = rawIdentifier.replace(/\D/g, "");
    const normalized = digits.length >= 9 ? digits.slice(-9) : "";
    const dni = digits.length === 8 ? digits : "";

    if (!normalized && !dni) {
      return NextResponse.json(
        { message: "Ingresa teléfono de 9 dígitos o DNI de 8 dígitos", reason: "bad_identifier" },
        { status: 400 }
      );
    }

    // 1) Resolvemos userId por clientProfile y caemos a users.phoneNumber
    const profile = await prisma.clientProfile.findFirst({
      where: {
        OR: [
          ...(normalized
            ? [{ profile_phone: normalized }, { profile_phone: `+51${normalized}` }]
            : []),
          ...(dni ? [{ documentNumber: dni }] : []),
        ],
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    let userId: string | null = profile?.user?.id ?? null;

    if (!userId) {
      const userByPhone = normalized
        ? await prisma.user.findFirst({
            where: {
              OR: [{ phoneNumber: normalized }, { phoneNumber: `+51${normalized}` }],
            },
            select: { id: true },
          })
        : null;
      userId = userByPhone?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { message: "Número no encontrado", reason: "not_found" },
        { status: 404 }
      );
    }

    // 2) Definimos ventana del día y ahora
    const now = new Date();
    const { start, end } = getLimaDayRange(now);

    // 3) Ejecutamos todo en una transacción (evita duplicados por carreras)
    const result = await prisma.$transaction(async (tx) => {
      // 3.1) Antirrebote: último check-in muy reciente y aún abierto
      const last = await tx.attendance.findFirst({
        where: { userId },
        orderBy: { checkInTime: "desc" },
      });

      if (
        last &&
        !last.checkOutTime &&
        last.checkInTime >= new Date(now.getTime() - REBOUND_SECONDS * 1000)
      ) {
        return { kind: "rebounce" as const, record: last };
      }

      // 3.2) ¿Tiene una asistencia abierta hoy? -> cerrar (check-out)
      const open = await tx.attendance.findFirst({
        where: {
          userId,
          checkInTime: { gte: start, lte: end },
          checkOutTime: null,
        },
        orderBy: { checkInTime: "desc" },
      });

      if (open) {
        const duration = Math.max(
          0,
          Math.round((now.getTime() - open.checkInTime.getTime()) / 60000)
        );
        const updated = await tx.attendance.update({
          where: { id: open.id },
          data: { checkOutTime: now, durationMins: duration },
        });
        return { kind: "checkout" as const, record: updated };
      }

      // 3.3) Límite de entradas por día
      const entriesCount = await tx.attendance.count({
        where: { userId, checkInTime: { gte: start, lte: end } },
      });
      if (entriesCount >= MAX_ENTRIES_PER_DAY) {
        return { kind: "limit" as const, record: null };
      }

      // 3.4) Crear nueva entrada (check-in)
      const created = await tx.attendance.create({
        data: { userId, checkInTime: now },
      });
      return { kind: "checkin" as const, record: created };
    });

    // 4) Respuesta
    if (result.kind === "rebounce") {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "rebote",
        message: "Registro ya tomado",
        record: result.record,
      });
    }
    if (result.kind === "checkout") {
      return NextResponse.json({
        ok: true,
        type: "checkout",
        message: "Salida registrada",
        record: result.record,
      });
    }
    if (result.kind === "limit") {
      return NextResponse.json(
        {
          ok: false,
          message: "Límite de entradas diarias alcanzado",
          reason: "limit_reached",
        },
        { status: 400 }
      );
    }

    // checkin
    return NextResponse.json({
      ok: true,
      type: "checkin",
      message: "Entrada registrada",
      record: result.record,
    });
  } catch (error) {
    console.error("❌ Error en POST /attendance:", error);
    return NextResponse.json(
      { message: "Error al registrar asistencia" },
      { status: 500 }
    );
  }
}
