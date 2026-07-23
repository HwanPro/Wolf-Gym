import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/infrastructure/prisma/prisma";
import { InMemoryRateLimitStore } from "@/server/security/rate-limit";
import {
  createSensitiveAdminToken,
  getSensitiveAdminAccess,
  SENSITIVE_ADMIN_COOKIE,
  SENSITIVE_ADMIN_TTL_SECONDS,
} from "@/server/security/sensitive-admin-access";

const bodySchema = z.object({ password: z.string().min(1).max(200) });
const verificationRateLimit = new InMemoryRateLimitStore();

export async function GET(request: NextRequest) {
  const access = await getSensitiveAdminAccess(request);
  const status =
    access.authorized || access.status === 428 ? 200 : access.status;
  return NextResponse.json({ verified: access.authorized }, { status });
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.id || token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const limit = verificationRateLimit.consume(
    String(token.id),
    5,
    15 * 60 * 1000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Demasiados intentos. Espera ${limit.retryAfterSeconds} segundos`,
      },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Contraseña requerida" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: String(token.id) },
    select: { password: true },
  });
  const valid = Boolean(
    user?.password &&
      (await bcrypt.compare(parsed.data.password, user.password)),
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Verificación inválida" },
      { status: 401 },
    );
  }

  verificationRateLimit.reset(String(token.id));
  const response = NextResponse.json({
    verified: true,
    expiresIn: SENSITIVE_ADMIN_TTL_SECONDS,
  });
  response.cookies.set(
    SENSITIVE_ADMIN_COOKIE,
    createSensitiveAdminToken(String(token.id)),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SENSITIVE_ADMIN_TTL_SECONDS,
    },
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ verified: false });
  response.cookies.set(SENSITIVE_ADMIN_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
