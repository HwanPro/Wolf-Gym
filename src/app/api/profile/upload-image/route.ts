import { assertExternalWrites } from "@/server/security/external-writes";
import { validateUploadFile, safeUploadBuffer } from "@/server/files/file-validation";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/infrastructure/prisma/prisma";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import {discardNewUploadIfUnreferenced} from "@/server/files/upload-recovery";

// Configuración del cliente S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  let uploadedKey: string | undefined;
  let persisted = false;
  try {
    // Verificar autenticación
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener el archivo del formData
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
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"], maxBytes: 5 * 1024 * 1024,
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // Convertir el archivo a buffer
    const buffer = await safeUploadBuffer(file);
    if (!buffer) return NextResponse.json({ error: "El contenido del archivo no es válido" }, { status: 400 });

    // Generar nombre único para el archivo
    const fileExtension = file.name.split(".").pop();
    const uniqueFileName = `${uuidv4()}-${Date.now()}.${fileExtension}`;
    const fileKey = `profile-images/${uniqueFileName}`;

    // Subir a S3
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
    };

    if (process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1") {
      return NextResponse.json({ error: "La carga de imágenes está deshabilitada en este entorno de prueba. Tu imagen actual se conserva." }, { status: 503 });
    }
    assertExternalWrites();

    await s3Client.send(new PutObjectCommand(uploadParams));
    uploadedKey = fileKey;

    const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    // Actualizar la imagen en la base de datos
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: imageUrl },
    });
    persisted = true;

    return NextResponse.json(
      {
        success: true,
        imageUrl,
        message: "Imagen de perfil actualizada correctamente"
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al subir imagen de perfil:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  } finally {
    if (uploadedKey && !persisted) {
      const key=uploadedKey,url=`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      await discardNewUploadIfUnreferenced(async()=>Boolean(await prisma.user.findFirst({where:{image:url},select:{id:true}})),()=>s3Client.send(new DeleteObjectCommand({Bucket:process.env.AWS_BUCKET_NAME!,Key:key})));
    }
  }
}
