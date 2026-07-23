import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const SENSITIVE_ADMIN_COOKIE = "wolf-sensitive-admin";
export const SENSITIVE_ADMIN_TTL_SECONDS = 10 * 60;

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET no está configurado");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSensitiveAdminToken(userId: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: now + SENSITIVE_ADMIN_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function isValidSensitiveAdminToken(
  value: string | undefined,
  userId: string,
) {
  if (!value) return false;
  const [payload, providedSignature] = value.split(".");
  if (!payload || !providedSignature) return false;
  const expectedSignature = signature(payload);
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return false;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      userId?: string;
      expiresAt?: number;
    };
    return data.userId === userId && Number(data.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export async function getSensitiveAdminAccess(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token)
    return { authorized: false as const, status: 401, error: "No autorizado" };
  if (token.role !== "admin" || !token.id) {
    return {
      authorized: false as const,
      status: 403,
      error: "Acceso restringido",
    };
  }
  const sensitiveToken = request.cookies.get(SENSITIVE_ADMIN_COOKIE)?.value;
  if (!isValidSensitiveAdminToken(sensitiveToken, String(token.id))) {
    return {
      authorized: false as const,
      status: 428,
      error: "Verificación requerida",
    };
  }
  return { authorized: true as const, userId: String(token.id) };
}
