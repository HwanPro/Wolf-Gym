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

// GET → Obtener galería completa
export async function GET() {
  try {
    const images = await prisma.gallery.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(images, { status: 200 });
  } catch (error) {
    console.error("Error al obtener imágenes:", error);
    // Fallback seguro → lista vacía
    return NextResponse.json([], { status: 200 });
  }
}

// POST → Subir imagen y guardar en DB
export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let uploadedKey: string | undefined;
  let persisted = false;
  try {
    const data = await request.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se seleccionó ningún archivo" },
        { status: 400 }
      );
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
    const today = new Date();
    const fileKey = `uploads/${today.getUTCFullYear()}/${today.getUTCMonth() + 1}/${today.getUTCDate()}/${uuidv4()}-${safeStorageSegment(file.name)}`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
    };

    if (process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1") {
      return NextResponse.json({ error: "La carga de imágenes está deshabilitada en este entorno de prueba. La galería se conserva." }, { status: 503 });
    }
    assertExternalWrites();

    await s3Client.send(new PutObjectCommand(uploadParams));
    uploadedKey = fileKey;

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    const newImage = await prisma.gallery.create({
      data: { imageUrl: fileUrl },
    });
    persisted = true;

    return NextResponse.json(
      { message: "Imagen subida correctamente", item: newImage },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al subir archivo:", error);
    return NextResponse.json(
      { error: "Error al subir archivo" },
      { status: 500 }
    );
  } finally {
    if (uploadedKey && !persisted) {
      const key=uploadedKey,url=`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      await discardNewUploadIfUnreferenced(async()=>Boolean(await prisma.gallery.findFirst({where:{imageUrl:url},select:{id:true}})),()=>s3Client.send(new DeleteObjectCommand({Bucket:process.env.AWS_BUCKET_NAME!,Key:key})));
    }
  }
}
