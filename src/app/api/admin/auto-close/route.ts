import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { getLimaDayRange } from "@/domain/attendance/attendance-policy";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

// POST: cierra abiertas del día
export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { start, end } = getLimaDayRange();

    const opened = await prisma.attendance.findMany({
      where: { checkInTime: { gte: start, lte: end }, checkOutTime: null },
    });

    let closed = 0;
    for (const r of opened) {
      const out = new Date();
      const duration = Math.max(0, Math.round((out.getTime() - new Date(r.checkInTime).getTime())/60000));
      await prisma.attendance.update({ where: { id: r.id }, data: { checkOutTime: out, durationMins: duration } });
      closed++;
    }

    return NextResponse.json({ ok: true, closed });
  } catch {
    return NextResponse.json({ ok: false, message: "falló autocierre" }, { status: 500 });
  }
}
