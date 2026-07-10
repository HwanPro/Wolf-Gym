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
    const data: {
      checkInTime?: Date;
      checkOutTime?: Date;
      durationMins?: number;
      type?: string;
    } = {};
    if (body.checkInTime)  data.checkInTime  = new Date(body.checkInTime);
    if (body.checkOutTime) data.checkOutTime = new Date(body.checkOutTime);
    if (typeof body.durationMins === "number") data.durationMins = body.durationMins;
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
