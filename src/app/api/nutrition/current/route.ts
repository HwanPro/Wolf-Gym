import { NextRequest, NextResponse } from "next/server";

import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { nutritionDatabaseError } from "@/server/nutrition/database-error";

export async function GET(request: NextRequest) {
  const authorization = await authorizeRequest(request, ["client", "admin"]);
  if (!authorization.authorized) return authorization.response;

  const userId = authorization.token.id;
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  try {
  const now = new Date();
  const assignment = await prisma.nutritionPlanAssignment.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      notes: true,
      version: {
        select: {
          version: true,
          mode: true,
          energyMode: true,
          targetCalories: true,
          targetProteinG: true,
          targetCarbohydrateG: true,
          targetFatG: true,
          targetFiberG: true,
          professionalNotes: true,
          professionalName: true,
          professionalRegistration: true,
          plan: { select: { name: true, description: true, objective: true } },
          days: {
            orderBy: { dayIndex: "asc" },
            select: {
              id: true,
              dayIndex: true,
              label: true,
              notes: true,
              meals: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  suggestedTime: true,
                  instructions: true,
                  items: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      name: true,
                      quantity: true,
                      unit: true,
                      displayAmount: true,
                      notes: true,
                      isAlternative: true,
                      alternativeGroup: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(
    { assignment },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  } catch (error) {
    const unavailable = nutritionDatabaseError(error);
    if (unavailable) return unavailable;
    console.error("No se pudo cargar la asignación nutricional", error);
    return NextResponse.json({ error: "No se pudo cargar el plan nutricional" }, { status: 500 });
  }
}
