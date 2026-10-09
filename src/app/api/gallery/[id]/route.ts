import { assertExternalWrites } from "@/server/security/external-writes";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/server/auth/authorization";
import { safeStorageSegment, validateUploadFile, safeUploadBuffer } from "@/server/files/file-validation";
import {discardNewUploadIfUnreferenced} from "@/server/files/upload-recovery";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface IParams {
  params: Promise<{ id: string }>;
}

// PUT → actualizar imagen en la galería (cambia imagen en S3 y en la BD)
export async function PUT(request: NextRequest, { params }: IParams) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let uploadedKey: string | undefined;
  let persisted = false;
  try {
    const { id } = await params;
    const existing = await prisma.gallery.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    const data = await request.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });
    }

    const validationError = validateUploadFile(file, {
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
      maxBytes: 5 * 1024 * 1024,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const buffer = await safeUploadBuffer(file);
    if (!buffer) return NextResponse.json({ error: "El contenido del archivo no es válido" }, { status: 400 });
    const fileKey = `uploads/gallery/${uuidv4()}-${safeStorageSegment(file.name)}`;

    assertExternalWrites();

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
    }));
    uploadedKey = fileKey;

    const newUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    // Actualizar en la base de datos
    const updated = await prisma.gallery.update({
      where: { id },
      data: { imageUrl: newUrl },
    });
    persisted = true;

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error al actualizar imagen:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  } finally {
    if (uploadedKey && !persisted) {
      const key=uploadedKey,url=`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      await discardNewUploadIfUnreferenced(async()=>Boolean(await prisma.gallery.findFirst({where:{imageUrl:url},select:{id:true}})),()=>s3Client.send(new DeleteObjectCommand({Bucket:process.env.AWS_BUCKET_NAME!,Key:key})));
    }
  }
}

// DELETE → eliminar imagen de S3 y de la BD
export async function DELETE(request: NextRequest, { params }: IParams) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await params;

    const existing = await prisma.gallery.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    // Eliminar de S3
    const match = existing.imageUrl.match(/\.amazonaws\.com\/(.+)$/);
    const key = match?.[1];

    if (key) {
      assertExternalWrites();
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
      }));
    }

    // Eliminar de la BD
    await prisma.gallery.delete({ where: { id } });

    return NextResponse.json({ message: "Imagen eliminada" }, { status: 200 });
  } catch (error) {
    console.error("Error al eliminar imagen:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
