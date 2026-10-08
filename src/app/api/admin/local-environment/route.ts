import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
export async function GET(request: NextRequest) {
  if (process.env.WOLF_LOCAL_ONLY !== "1") return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const [database] = await prisma.$queryRaw<{ database: string; address: string; port: number }[]>`SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  return NextResponse.json({ ...database, origin: new URL(process.env.NEXTAUTH_URL!).origin, externalWritesDisabled: process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1" });
}
