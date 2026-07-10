// src/app/api/plans/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { toMembershipPlanView } from "@/lib/membershipPlans";
import { requireAdmin } from "@/server/auth/authorization";


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const price = Number(body?.price);
    const description = String(body?.description || "").trim();
    if (!name || !Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: "Nombre y precio válidos son requeridos" },
        { status: 400 },
      );
    }

    // Lógica para actualizar
    const updatedPlan = await prisma.plan.update({
      where: { id },
      data: { name, price, description },
    });

    return NextResponse.json(toMembershipPlanView(updatedPlan), { status: 200 });
  } catch (error) {
    console.error("Error en PUT /api/plans/[id]:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
