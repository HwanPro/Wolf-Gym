import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { decode, encode } from "next-auth/jwt";
import { PersistentRateLimitStore } from "@/server/security/persistent-rate-limit";

const enrollmentCookie = "wolf-2fa-enrollment";
const enrollmentLimit = new PersistentRateLimitStore("2fa-enrollment");

// POST: Generar código QR y secreto para 2FA
export async function POST(req: NextRequest) {
  const authorization = await authorizeRequest(req, ["admin", "client"]);
  if (!authorization.authorized) return authorization.response;

  try {
    const user = await prisma.user.findUnique({
      where: { id: String(authorization.token.id) },
      select: { twoFASecret: true },
    });
    if (!user)
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 },
      );
    if (user.twoFASecret)
      return NextResponse.json(
        { error: "2FA ya está habilitado" },
        { status: 409 },
      );
    const secret = speakeasy.generateSecret({ length: 20 });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url as string);

    const challenge = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 600,
      token: {
        id: String(authorization.token.id),
        enrollmentSecret: secret.base32,
        credentialVersion: authorization.token.credentialVersion,
      },
    });
    const response = NextResponse.json(
      { qrCode, secret: secret.base32 },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(enrollmentCookie, challenge, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
      path: "/api/auth/2FA",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    console.error("Error al generar el secreto 2FA:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
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
    const limit = await enrollmentLimit.consume(
      String(authorization.token.id),
      8,
      15 * 60 * 1000,
    );
    if (!limit.allowed)
      return NextResponse.json(
        { error: "Demasiados intentos" },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    const challenge = await decode({
      token: req.cookies.get(enrollmentCookie)?.value,
      secret: process.env.NEXTAUTH_SECRET!,
    }).catch(() => null);
    if (
      !challenge ||
      challenge.id !== authorization.token.id ||
      challenge.credentialVersion !== authorization.token.credentialVersion ||
      challenge.enrollmentSecret !== secret
    ) {
      return NextResponse.json(
        { error: "Inicia nuevamente la configuración de 2FA" },
        { status: 400 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: authorization.token.id as string },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario o secreto no encontrado" },
        { status: 404 },
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
    if (user.twoFASecret)
      return NextResponse.json(
        { error: "2FA ya está habilitado" },
        { status: 409 },
      );

    const updated = await prisma.user.updateMany({
      where: { id: user.id, twoFASecret: null },
      data: { twoFASecret: secret },
    });
    if (updated.count !== 1)
      return NextResponse.json(
        { error: "2FA ya está habilitado" },
        { status: 409 },
      );
    const response = NextResponse.json({
      message: "2FA habilitado correctamente. Inicia sesión nuevamente.",
    });
    response.cookies.set(enrollmentCookie, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/api/auth/2FA",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Error al verificar el token 2FA:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
