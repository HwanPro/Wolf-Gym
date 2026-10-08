import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
import prisma from "@/infrastructure/prisma/prisma";
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const kind = request.nextUrl.searchParams.get("kind"), key = request.nextUrl.searchParams.get("key");
  const action = await prisma.cashAction.findUnique({ where: { requestKey: `${auth.token.id}:${kind}:${key}` } });
  return NextResponse.json(action?.result ?? { error: "Operación todavía no registrada" }, { status: action ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
