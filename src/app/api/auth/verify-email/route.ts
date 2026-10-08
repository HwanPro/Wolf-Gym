import { randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { saveLocalMail } from "@/server/security/local-mail";
import { assertExternalWrites } from "@/server/security/external-writes";
import { z } from "zod";

import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { PersistentRateLimitStore } from "@/server/security/persistent-rate-limit";
import { getAppBaseUrl } from "@/lib/mail";

const attempts = new PersistentRateLimitStore("email-verification");
const sendSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  userId: z.string().max(100).optional(),
  type: z.enum(["code", "link"]).default("code"),
});
const verifySchema = z
  .object({
    userId: z.string().max(100).optional(),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.token));

function invalid() {
  return NextResponse.json(
    { error: "Código o token inválido, utilizado o expirado" },
    { status: 400 },
  );
}

async function throttle(key: string, limit: number) {
  const result = await attempts.consume(key, limit, 15 * 60 * 1000);
  return result.allowed
    ? null
    : NextResponse.json(
        { error: "Demasiados intentos. Inténtalo más tarde" },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        },
      );
}

export async function POST(req: NextRequest) {
  const access = await authorizeRequest(req, ["admin", "client"]);
  if (!access.authorized) return access.response;
  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  const userId = String(access.token.id);
  if (parsed.data.userId && parsed.data.userId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const limited = await throttle("send:" + userId, 3);
  if (limited) return limited;

  try {
    const { email, type } = parsed.data;
    const [existingUser, existingVerification] = await Promise.all([
      prisma.user.findFirst({
        where: {
          username: { equals: email, mode: "insensitive" },
          id: { not: userId },
        },
        select: { id: true },
      }),
      prisma.emailVerification.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          userId: { not: userId },
        },
        select: { id: true },
      }),
    ]);
    if (existingUser || existingVerification) {
      return NextResponse.json(
        { error: "Este email ya está en uso" },
        { status: 409 },
      );
    }
    const code = randomInt(100000, 1000000).toString();
    const token = randomBytes(32).toString("hex");
    const data = {
      email,
      code,
      token,
      verified: false,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
    await prisma.emailVerification.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    const port = Number(
      process.env.SMTP_PORT || process.env.EMAIL_PORT || "587",
    );
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      dnsTimeout: 10000,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
      },
    });
    const link = getAppBaseUrl() + "/auth/verify-email?token=" + token;
    const message = {
      from:
        process.env.SMTP_FROM ||
        process.env.EMAIL_FROM ||
        process.env.SMTP_USER ||
        process.env.EMAIL_USER,
      to: email,
      subject: "Verificación de Email - Wolf Gym",
      text:
        type === "code"
          ? "Tu código de verificación es " + code + ". Expira en 15 minutos."
          : "Verifica tu email: " + link + " (expira en 15 minutos).",
    };
    if (!(await saveLocalMail(message))) {
      assertExternalWrites();
      await transporter.sendMail(message);
    }
    return NextResponse.json({
      success: true,
      message:
        type === "code"
          ? "Código de verificación enviado a tu email"
          : "Link de verificación enviado a tu email",
      type,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo enviar el email de verificación" },
      { status: 502 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const parsed = verifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid();
  let userId: string | undefined;
  if (parsed.data.code) {
    const access = await authorizeRequest(req, ["admin", "client"]);
    if (!access.authorized) return access.response;
    userId = String(access.token.id);
    if (parsed.data.userId && parsed.data.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const limited = await throttle("verify:" + userId, 8);
    if (limited) return limited;
  }
  try {
    const record = await prisma.emailVerification.findFirst({
      where: {
        ...(userId
          ? { userId, code: parsed.data.code }
          : { token: parsed.data.token }),
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) return invalid();
    const consumed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerification.updateMany({
        where: {
          id: record.id,
          token: record.token,
          code: record.code,
          verified: false,
          expiresAt: { gt: new Date() },
        },
        data: { verified: true },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({
        where: { id: record.userId },
        data: { username: record.email },
      });
      return true;
    });
    if (!consumed) return invalid();
    return NextResponse.json({
      success: true,
      message:
        "Email verificado exitosamente. Tu nombre de usuario ha sido actualizado.",
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo verificar el email" },
      { status: 500 },
    );
  }
}
