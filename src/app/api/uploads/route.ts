import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdmin } from "@/server/auth/authorization";
import {
  safeStorageSegment,
  validateUploadFile,
} from "@/server/files/file-validation";

// Configuración del cliente S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    // Obtener el archivo del formData
    const data = await req.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se seleccionó ningún archivo" },
        { status: 400 }
      );
    }

    // Validar el tipo y tamaño del archivo
    const validationError = validateUploadFile(file, {
      allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
      allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
      maxBytes: 5 * 1024 * 1024,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Get folder from form data or default to 'uploads'
    const folder = safeStorageSegment(String(data.get("folder") || "uploads"));

    // Convertir el archivo a buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generar nombre único para el archivo
    const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeStorageSegment(file.name)}`;
    const fileKey = `${folder}/${fileName}`;

    // Subir a S3
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    return NextResponse.json(
      { message: "Archivo subido con éxito", fileUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al subir archivo:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
