import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/infrastructure/prisma/prisma";
import { getAppBaseUrl, sendPasswordResetEmail } from "@/lib/mail";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const GENERIC_RESPONSE =
  "Si el usuario o correo esta registrado, recibiras un enlace para restablecer tu contrasena.";

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = normalizeIdentifier(
      body.identifier || body.email || body.username,
    );

    if (!identifier) {
      return NextResponse.json(
        { message: "Ingresa tu usuario o correo electronico" },
        { status: 400 },
      );
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return NextResponse.json({ message: GENERIC_RESPONSE });
    }

    const destinationEmail = await getUserRecoveryEmail(user.id, user.username);
    if (!destinationEmail) {
      return NextResponse.json({ message: GENERIC_RESPONSE });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      update: {
        tokenHash,
        expiresAt,
        usedAt: null,
      },
      create: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const resetLink = `${getAppBaseUrl()}/auth/reset-password?token=${token}`;
    const displayName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ");

    await sendPasswordResetEmail(
      destinationEmail,
      displayName || user.username,
      resetLink,
    );

    return NextResponse.json({ message: GENERIC_RESPONSE });
  } catch (error) {
    console.error("Error al enviar correo de recuperacion:", error);
    return NextResponse.json(
      { message: "No se pudo enviar el correo de recuperacion." },
      { status: 500 },
    );
  }
}

async function findUserByIdentifier(identifier: string) {
  const filters = [
    { username: { equals: identifier, mode: "insensitive" as const } },
    { phoneNumber: identifier },
  ];

  if (isEmail(identifier)) {
    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: { equals: identifier, mode: "insensitive" },
        verified: true,
      },
      select: { userId: true },
    });

    if (verification) {
      const verifiedUser = await prisma.user.findUnique({
        where: { id: verification.userId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      });

      if (verifiedUser) return verifiedUser;
    }
  }

  return prisma.user.findFirst({
    where: { OR: filters },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
    },
  });
}

async function getUserRecoveryEmail(userId: string, username: string) {
  if (isEmail(username)) return username;

  const verification = await prisma.emailVerification.findUnique({
    where: { userId },
    select: { email: true, verified: true },
  });

  return verification?.verified &&
    verification.email &&
    isEmail(verification.email)
    ? verification.email
    : null;
}
