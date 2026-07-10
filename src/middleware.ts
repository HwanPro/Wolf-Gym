import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Rutas privadas:
  if (
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/client") ||
    request.nextUrl.pathname.startsWith("/profile")
  ) {
    // Si no hay token => fuerza login
    if (!token) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    // Chequea rol
    if (
      request.nextUrl.pathname.startsWith("/admin") &&
      token.role !== "admin"
    ) {
      return NextResponse.redirect(new URL("/client/dashboard", request.url));
    }
    if (
      request.nextUrl.pathname.startsWith("/client") &&
      token.role !== "client"
    ) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/client/:path*", "/admin/:path*", "/profile/:path*"],
};
