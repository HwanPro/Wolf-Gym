import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";

// POST: Generar código QR y secreto para 2FA
export async function POST(req: NextRequest) {
  const authorization = await authorizeRequest(req, ["admin", "client"]);
  if (!authorization.authorized) return authorization.response;

  try {
    const secret = speakeasy.generateSecret({ length: 20 });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url as string);

    return NextResponse.json({ qrCode, secret: secret.base32 });
  } catch (error) {
    console.error("Error al generar el secreto 2FA:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT: Verificar el token 2FA
export async function PUT(req: NextRequest) {
  const authorization = await authorizeRequest(req, ["admin", "client"]);
  if (!authorization.authorized) return authorization.response;

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (!/^\d{6}$/.test(token) || !/^[A-Z2-7]{16,64}$/i.test(secret)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authorization.token.id as string },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario o secreto no encontrado" },
        { status: 404 }
      );
    }

    const isValid = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFASecret: secret },
    });

    return NextResponse.json({ message: "2FA habilitado correctamente" });
  } catch (error) {
    console.error("Error al verificar el token 2FA:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
