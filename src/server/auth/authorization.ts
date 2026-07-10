import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export type AppRole = "admin" | "client";
export type RoleCarrier = { role?: unknown };

export function canAccess(
  subject: RoleCarrier | null | undefined,
  allowedRoles: readonly AppRole[],
) {
  return (
    typeof subject?.role === "string" &&
    allowedRoles.includes(subject.role as AppRole)
  );
}

export function safeRedirectForRole(role: unknown) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "client") return "/client/dashboard";
  return "/auth/login";
}

export async function requestToken(request: NextRequest) {
  return getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
}

export type AuthorizationResult =
  | { authorized: true; token: JWT }
  | { authorized: false; response: NextResponse };

export async function authorizeRequest(
  request: NextRequest,
  roles: readonly AppRole[],
): Promise<AuthorizationResult> {
  const token = await requestToken(request);
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  if (!canAccess(token, roles)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }
  return { authorized: true, token };
}

export function requireAdmin(request: NextRequest) {
  return authorizeRequest(request, ["admin"]);
}
