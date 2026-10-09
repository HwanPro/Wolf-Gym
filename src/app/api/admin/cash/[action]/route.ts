import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/authorization";
import { executeCashAction, quote } from "@/server/cash/cash-service";
import { CashError, quoteSchema } from "@/domain/cash/cash-policy";
import prisma from "@/infrastructure/prisma/prisma";
import { getSensitiveAdminAccess } from "@/server/security/sensitive-admin-access";
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const { action } = await context.params;
  try {
    if (action === "void") {
      const access = await getSensitiveAdminAccess(request);
      if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const body = await request.json();
    if (action === "quote") return NextResponse.json({ ok: true, result: await quote(prisma, quoteSchema.parse(body)) });
    return NextResponse.json(await executeCashAction(String(auth.token.id), action, request.headers.get("Idempotency-Key"), body));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    if (error instanceof CashError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    console.error("Operación de caja fallida", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo confirmar la operación. Consulte o reintente con la misma clave." }, { status: 500 });
  }
}
