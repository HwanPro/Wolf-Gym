import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

// PATCH: corrige checkInTime / checkOutTime / type
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await prisma.attendance.findUnique({where:{id}});
    if (!existing) return NextResponse.json({ok:false,message:"Registro no encontrado"},{status:404});
    const data: {
      checkInTime?: Date;
      checkOutTime?: Date | null;
      durationMins?: number | null;
      type?: string;
    } = {};
    if (body.checkInTime !== undefined) data.checkInTime = new Date(body.checkInTime);
    if (body.checkOutTime !== undefined) data.checkOutTime = body.checkOutTime === null ? null : new Date(body.checkOutTime);
    const start = data.checkInTime ?? existing.checkInTime;
    const end = data.checkOutTime !== undefined ? data.checkOutTime : existing.checkOutTime;
    if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end < start))) {
      return NextResponse.json({ok:false,message:"Las fechas de asistencia no son válidas"},{status:400});
    }
    if (body.checkInTime !== undefined || body.checkOutTime !== undefined) {
      data.durationMins = end ? Math.round((end.getTime()-start.getTime())/60000) : null;
    } else if (body.durationMins !== undefined) {
      if (!Number.isInteger(body.durationMins) || body.durationMins < 0) return NextResponse.json({ok:false,message:"Duración inválida"},{status:400});
      data.durationMins = body.durationMins;
    }
    if (typeof body.type === "string") data.type = body.type;

    const updated = await prisma.attendance.update({ where: { id }, data });
    return NextResponse.json({ ok: true, record: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, message: "No se pudo actualizar" }, { status: 500 });
  }
}

// DELETE: elimina el registro
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await params;
    await prisma.attendance.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: "No se pudo eliminar" }, { status: 500 });
  }
}
