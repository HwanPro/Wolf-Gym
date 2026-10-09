import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/infrastructure/prisma/prisma";
import { z } from "zod";
import {assertExternalWrites} from "@/server/security/external-writes";
import {readExerciseUploadProof,verifyExerciseStoredObject,exerciseObjectURL} from "@/server/files/exercise-object";

// Esquema de validación para crear media
const createMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url(),
  uploadToken:z.string().min(1).max(6000),
  thumbnailUrl: z.string().url().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  durationSec: z.number().int().min(0).optional(),
  order: z.number().int().min(0).default(0),
  isCover: z.boolean().default(false)
});

// POST - Crear media para ejercicio
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = createMediaSchema.parse(body);

    // Verificar que el ejercicio existe
    const exercise = await prisma.exercise.findUnique({
      where: { id: (await params).id }
    });

    if (!exercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    const exerciseId=(await params).id;
    const {uploadToken,...mediaData}=data;
    const proof=await readExerciseUploadProof(uploadToken,session.user.id!,exerciseId);
    if(!proof||proof.type!==data.type||data.url!==exerciseObjectURL(proof.fileKey))return NextResponse.json({error:"La carga no corresponde a este usuario, ejercicio o archivo"},{status:400});
    if(data.thumbnailUrl&&!await prisma.exerciseMedia.findFirst({where:{exerciseId,type:"image",url:data.thumbnailUrl},select:{id:true}}))return NextResponse.json({error:"La miniatura debe ser una imagen verificada del mismo ejercicio"},{status:400});
    if(process.env.WOLF_DISABLE_EXTERNAL_WRITES==="1")return NextResponse.json({error:"La validación de archivos está deshabilitada en este entorno de prueba"},{status:503});
    assertExternalWrites();
    if(!await verifyExerciseStoredObject(proof))return NextResponse.json({error:"El objeto subido no existe o no coincide con el formato, tamaño y contenido autorizados"},{status:400});
    const media=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"exercise-media:"+exerciseId}))`;
      const existing=await tx.exerciseMedia.findFirst({where:{exerciseId,url:data.url}});
      if(existing)return existing;
      if(data.isCover)await tx.exerciseMedia.updateMany({where:{exerciseId,isCover:true},data:{isCover:false}});
      const last=data.order===0?await tx.exerciseMedia.findFirst({where:{exerciseId},orderBy:{order:"desc"}}):null;
      return tx.exerciseMedia.create({data:{...mediaData,url:exerciseObjectURL(proof.fileKey),exerciseId,order:data.order||((last?.order||0)+1)}});
    });

    return NextResponse.json({ id: media.id });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al crear media:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET - Obtener media de un ejercicio
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que el ejercicio existe
    const exercise = await prisma.exercise.findUnique({
      where: { id: (await params).id }
    });

    if (!exercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Si no es admin, solo mostrar media de ejercicios publicados
    if (session.user?.role !== 'admin' && !exercise.isPublished) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    const media = await prisma.exerciseMedia.findMany({
      where: { exerciseId: (await params).id },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json(media);

  } catch (error) {
    console.error("Error al obtener media:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
