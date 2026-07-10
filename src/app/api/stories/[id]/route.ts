// src/app/api/stories/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await params;
    await prisma.story.delete({ where: { id } });
    return NextResponse.json(
      { message: "Historia eliminada" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
