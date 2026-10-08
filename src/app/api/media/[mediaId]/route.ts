import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/infrastructure/prisma/prisma";
import { z } from "zod";


// Esquema de validación para actualizar media
const updateMediaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  order: z.number().int().min(0).optional(),
  isCover: z.boolean().optional()
});

// PUT - Actualizar media (reordenar, marcar cover, etc.)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = updateMediaSchema.parse(body);

    // Verificar que el media existe
    const existingMedia = await prisma.exerciseMedia.findUnique({
      where: { id: (await params).mediaId }
    });

    if (!existingMedia) {
      return NextResponse.json(
        { error: "Media no encontrado" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"exercise-media:"+existingMedia.exerciseId}))`;
      if(data.isCover)await tx.exerciseMedia.updateMany({where:{exerciseId:existingMedia.exerciseId,isCover:true,id:{not:existingMedia.id}},data:{isCover:false}});
      await tx.exerciseMedia.update({where:{id:existingMedia.id},data});
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al actualizar media:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar media
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Verificar que el media existe
    const existingMedia = await prisma.exerciseMedia.findUnique({
      where: { id: (await params).mediaId }
    });

    if (!existingMedia) {
      return NextResponse.json(
        { error: "Media no encontrado" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"exercise-media:"+existingMedia.exerciseId}))`;
      const current=await tx.exerciseMedia.findUnique({where:{id:existingMedia.id}});
      if(!current)return;
      await tx.exerciseMedia.delete({where:{id:existingMedia.id}});
      if(current.isCover){
        const replacement=await tx.exerciseMedia.findFirst({where:{exerciseId:current.exerciseId},orderBy:[{order:"asc"},{createdAt:"asc"}]});
        if(replacement)await tx.exerciseMedia.update({where:{id:replacement.id},data:{isCover:true}});
      }
    });

    // TODO: Aquí se podría agregar lógica para eliminar el archivo de S3
    // si es necesario, aunque generalmente se mantienen por seguridad

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("Error al eliminar media:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
