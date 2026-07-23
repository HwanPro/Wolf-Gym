import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSensitiveAdminAccess } from "@/server/security/sensitive-admin-access";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(request: NextRequest) {
  const access = await getSensitiveAdminAccess(request);
  if (!access.authorized)
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Clave de objeto requerida" },
        { status: 400 },
      );
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
    });

    // URL temporal: evita conservar rutas reutilizables durante una sesión completa.
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
    });

    return NextResponse.json({
      success: true,
      signedUrl,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Error generando URL firmada:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
