import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
import prisma from "@/infrastructure/prisma/prisma";
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const products = await prisma.inventoryItem.findMany({ orderBy: { item_name: "asc" } });
  return NextResponse.json(products.map(item => ({ ...item, category: item.item_category ?? "general" })), { headers: { "Cache-Control": "no-store" } });
}
