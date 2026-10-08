import { assertExternalWrites } from "@/server/security/external-writes";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import prisma from "@/infrastructure/prisma/prisma";
import { z } from "zod";
import { exerciseUploadSchema } from "@/server/files/exercise-upload-policy";
import {issueExerciseUploadProof} from "@/server/files/exercise-object";
import {randomUUID} from "node:crypto";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Esquema de validación para presigned URL
const presignSchema = exerciseUploadSchema;

// POST - Generar presigned URL para subir media
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
    const { type, contentType, filename, fileSize, checksumSHA256 } = presignSchema.parse(body);

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

    // Generar nombre único para el archivo
    const fileExtension = filename.split(".").pop();
    const uniqueFilename = `${randomUUID()}.${fileExtension?.toLowerCase()}`;

    const folder = type === "image" ? "exercises/images" : "exercises/videos";
    const fileKey = `${folder}/${uniqueFilename}`;

    // Generar presigned URL
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      ContentType: contentType,
      ContentLength: fileSize,
      ChecksumSHA256: checksumSHA256,
      Metadata: {
        exerciseId: (await params).id,
        uploadedBy: session.user.id!
      }
    });

    if (process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1") {
      return NextResponse.json({ error: "La carga de archivos está deshabilitada en este entorno de prueba." }, { status: 503 });
    }
    assertExternalWrites();

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-length", "content-type"]),
      unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
    });
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    const uploadToken=await issueExerciseUploadProof({ownerId:session.user.id!,exerciseId:(await params).id,fileKey,type,contentType,fileSize,checksumSHA256});

    return NextResponse.json({
      uploadUrl,
      publicUrl,
      uploadToken,
      fileKey,
      requiredHeaders: { "Content-Type": contentType, "x-amz-checksum-sha256": checksumSHA256 },
      expectedBytes: fileSize,
      expiresIn: 300,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al generar presigned URL:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
