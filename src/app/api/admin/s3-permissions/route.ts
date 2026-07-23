import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";
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
    const command = new GetBucketPolicyCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
    });

    const response = await s3Client.send(command);
    const policy = JSON.parse(response.Policy || "{}");

    return NextResponse.json({
      success: true,
      isPublic:
        policy?.Statement?.some(
          (statement: { Effect?: string; Principal?: string }) =>
            statement.Effect === "Allow" && statement.Principal === "*",
        ) || false,
    });
  } catch (error) {
    console.error("Error obteniendo política del bucket:", error);
    return NextResponse.json({
      success: false,
      error: "No se pudo obtener la política del bucket",
    });
  }
}

export async function POST(request: NextRequest) {
  const access = await getSensitiveAdminAccess(request);
  if (!access.authorized)
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );

  try {
    const { action } = await request.json();
    const bucketName = process.env.AWS_BUCKET_NAME!;

    if (action === "make-public") {
      // Política para hacer público el bucket
      const publicPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${bucketName}/*`,
          },
        ],
      };

      const command = new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(publicPolicy),
      });

      await s3Client.send(command);

      return NextResponse.json({
        success: true,
        message: "Bucket configurado como público para lectura",
      });
    }

    if (action === "make-private") {
      // Eliminar política pública
      const command = new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [],
        }),
      });

      await s3Client.send(command);

      return NextResponse.json({
        success: true,
        message: "Bucket configurado como privado",
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    console.error("Error configurando permisos del bucket:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 },
    );
  }
}
