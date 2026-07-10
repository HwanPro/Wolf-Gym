import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import {
  DEFAULT_MEMBERSHIP_PLANS,
  toMembershipPlanView,
} from "@/lib/membershipPlans";
import { requireAdmin } from "@/server/auth/authorization";

export async function GET() {
  try {
    const existingPlans = await prisma.plan.findMany({
      orderBy: { price: "asc" },
    });

    return NextResponse.json(
      existingPlans.length > 0
        ? existingPlans.map(toMembershipPlanView)
        : DEFAULT_MEMBERSHIP_PLANS,
      { status: 200 },
    );
  } catch (error) {
    console.error("Error al obtener los planes:", error);
    return NextResponse.json(DEFAULT_MEMBERSHIP_PLANS, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const price = Number(body?.price);
    const description = String(body?.description || "").trim();
    const slug =
      String(body?.slug || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-") ||
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    if (!name || !Number.isFinite(price) || price < 0 || !slug) {
      return NextResponse.json(
        { error: "Nombre, precio y slug válidos son requeridos" },
        { status: 400 },
      );
    }

    const plan = await prisma.plan.create({
      data: { name, price, description, slug },
    });

    return NextResponse.json(toMembershipPlanView(plan), { status: 201 });
  } catch (error) {
    console.error("Error al crear plan:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
