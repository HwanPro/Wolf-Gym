import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "@/server/auth/authorization";
import prisma from "@/infrastructure/prisma/prisma";
import { getMembershipStatus } from "@/domain/attendance/attendance-policy";

export const dynamic = "force-dynamic";

function normalizeIdentifier(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function calcDaysLeft(endDate?: Date | null) {
  return getMembershipStatus(endDate).daysLeft;
}

async function resolveUserId(identifierRaw?: string | null, userId?: string | null) {
  if (userId) return userId;

  const digits = normalizeIdentifier(identifierRaw || "");
  if (!digits) return null;

  const phoneLast9 = digits.length >= 9 ? digits.slice(-9) : "";
  const documentNumber = digits.length === 8 ? digits : "";
  const orConditions: Array<{ profile_phone: string } | { documentNumber: string }> = [];

  if (phoneLast9) {
    orConditions.push(
      { profile_phone: phoneLast9 },
      { profile_phone: `+51${phoneLast9}` },
      { profile_phone: `51${phoneLast9}` },
    );
  }
  if (documentNumber) orConditions.push({ documentNumber });

  if (orConditions.length) {
    const profiles = await prisma.clientProfile.findMany({
      where: { OR: orConditions },
      select: { user_id: true },
      take: 2,
    });
    if (profiles.length > 1) throw new Error("ambiguous_identifier");
    if (profiles[0]?.user_id) return profiles[0].user_id;
  }

  if (phoneLast9) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { phoneNumber: phoneLast9 },
          { phoneNumber: `+51${phoneLast9}` },
          { phoneNumber: `51${phoneLast9}` },
        ],
      },
      select: { id: true },
      take: 2,
    });
    if (users.length > 1) throw new Error("ambiguous_identifier");
    if (users[0]?.id) return users[0].id;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const token = await requestToken(request);

  if (!token) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = await resolveUserId(body?.identifier, body?.userId);

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "Cliente no encontrado" },
        { status: 404 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        profile: {
          select: {
            profile_id: true,
            profile_first_name: true,
            profile_last_name: true,
            profile_plan: true,
            profile_end_date: true,
            debt: true,
          },
        },
      },
    });

    if (!user?.profile) {
      return NextResponse.json(
        { ok: false, message: "El usuario no tiene perfil de cliente" },
        { status: 404 },
      );
    }

    const dailyDebts = await prisma.dailyDebt.findMany({
      where: { clientProfileId: user.profile.profile_id },
      select: { amount: true },
    });
    const dailyDebt = dailyDebts.reduce((sum, debt) => sum + Number(debt.amount), 0);
    const monthlyDebt = Number(user.profile.debt || 0);
    const fullName =
      `${user.profile.profile_first_name || ""} ${user.profile.profile_last_name || ""}`.trim() ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username;

    return NextResponse.json({
      ok: true,
      userId: user.id,
      profileId: user.profile.profile_id,
      fullName,
      plan: user.profile.profile_plan,
      endDate: user.profile.profile_end_date,
      daysLeft: calcDaysLeft(user.profile.profile_end_date),
      monthlyDebt,
      dailyDebt,
      totalDebt: monthlyDebt + dailyDebt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ambiguous_identifier") {
      return NextResponse.json({ok:false,reason:"ambiguous_identifier",message:"El identificador pertenece a varios clientes. Corrige los duplicados."},{status:409});
    }
    console.error("client lookup error:", error);
    return NextResponse.json({ ok: false, message: "Error interno" }, { status: 500 });
  }
}
