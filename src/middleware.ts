import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { isTrustedMutation } from "@/server/security/request-origin";

export async function middleware(request: NextRequest) {
  const redirectBase = process.env.NEXTAUTH_URL || request.url;
  if (!isTrustedMutation(request, process.env.NEXTAUTH_URL, process.env.WOLF_LOCAL_ONLY === "1")) {
    return NextResponse.json({ error: "El origen de la solicitud no está permitido" }, { status: 403 });
  }
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Rutas privadas:
  if (
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/check-in") ||
    request.nextUrl.pathname.startsWith("/client") ||
    request.nextUrl.pathname.startsWith("/profile")
  ) {
    // Si no hay token => fuerza login
    if (!token) {
      return NextResponse.redirect(new URL("/auth/login", redirectBase));
    }
    // Chequea rol
    if (
      (request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/check-in")) &&
      token.role !== "admin"
    ) {
      return NextResponse.redirect(new URL("/client/dashboard", redirectBase));
    }
    if (
      request.nextUrl.pathname.startsWith("/client") &&
      token.role !== "client"
    ) {
      return NextResponse.redirect(new URL("/admin/dashboard", redirectBase));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/client/:path*", "/admin/:path*", "/profile/:path*", "/check-in/:path*"],
};
