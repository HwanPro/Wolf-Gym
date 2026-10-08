import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requestToken } from "@/server/auth/authorization";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {

  // Obtener el token
  const token = await requestToken(request);

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const clients = await prisma.clientProfile.findMany();
    return NextResponse.json(clients);
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    return NextResponse.json({ error: "No se pudieron obtener los clientes" }, { status: 500 });
  }
}
