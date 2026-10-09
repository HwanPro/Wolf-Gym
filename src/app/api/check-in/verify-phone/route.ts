import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { userId, phone } = await req.json();
    const normalized = String(phone || "").replace(/\D/g, "").slice(-9);
    if (!userId || normalized.length !== 9) {
      return NextResponse.json({ ok: false, message: "Datos inválidos" }, { status: 400 });
    }

    const profile = await prisma.clientProfile.findFirst({
      where: { OR: [{ profile_phone: normalized }, { profile_phone: `+51${normalized}` }] },
      include: { user: true },
    });

    if (!profile?.user || profile.user.id !== userId) {
      return NextResponse.json({ ok: false, message: "Teléfono no coincide con el usuario", reason: "mismatch" }, { status: 400 });
    }

    const fullName = `${profile.user.firstName ?? ""} ${profile.user.lastName ?? ""}`.trim();
    return NextResponse.json({ ok: true, userId, fullName });
  } catch {
    return NextResponse.json({ ok: false, message: "Error validando" }, { status: 500 });
  }
}
