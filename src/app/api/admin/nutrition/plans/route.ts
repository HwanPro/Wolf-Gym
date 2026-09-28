import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { nutritionPlanInputSchema } from "@/domain/nutrition/nutrition-policy";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { nutritionDatabaseError } from "@/server/nutrition/database-error";

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const plans = await prisma.nutritionPlan.findMany({
      where: { isArchived: false },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        objective: true,
        updatedAt: true,
        versions: {
          where: { isPublished: true },
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            mode: true,
            energyMode: true,
            targetCalories: true,
            durationWeeks: true,
            professionalName: true,
            _count: { select: { assignments: true, days: true } },
          },
        },
      },
    });

    return NextResponse.json({ items: plans });
  } catch (error) {
    console.error("GET /api/admin/nutrition/plans failed", error);
    return (
      nutritionDatabaseError(error) ??
      NextResponse.json({ error: "No se pudieron cargar los planes" }, { status: 500 })
    );
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const actorId = authorization.token.id;
  if (typeof actorId !== "string") {
    return NextResponse.json({ error: "Sesión administrativa inválida" }, { status: 401 });
  }

  try {
    const input = nutritionPlanInputSchema.parse(await request.json());
    const created = await prisma.nutritionPlan.create({
      data: {
        name: input.name,
        description: input.description,
        objective: input.objective,
        createdBy: actorId,
        versions: {
          create: {
            version: 1,
            mode: input.mode,
            energyMode: input.energyMode,
            targetCalories: input.targetCalories,
            targetProteinG: input.targetProteinG,
            targetCarbohydrateG: input.targetCarbohydrateG,
            targetFatG: input.targetFatG,
            targetFiberG: input.targetFiberG,
            durationWeeks: input.durationWeeks,
            professionalNotes: input.professionalNotes,
            professionalName: input.professionalName,
            professionalRegistration: input.professionalRegistration,
            calculationMethod: input.calculationMethod,
            calculationSnapshot: input.calculationSnapshot as Prisma.InputJsonValue | undefined,
            isPublished: input.publish,
            publishedAt: input.publish ? new Date() : null,
            days: {
              create: input.days.map((day) => ({
                dayIndex: day.dayIndex,
                label: day.label,
                notes: day.notes,
                meals: {
                  create: day.meals.map((meal, mealIndex) => ({
                    name: meal.name,
                    suggestedTime: meal.suggestedTime,
                    sortOrder: meal.sortOrder ?? mealIndex,
                    instructions: meal.instructions,
                    items: {
                      create: meal.items.map((item, itemIndex) => ({
                        foodId: item.foodId,
                        name: item.name,
                        quantity: item.quantity,
                        unit: item.unit,
                        gramsEquivalent: item.gramsEquivalent,
                        displayAmount: item.displayAmount,
                        calories: item.calories,
                        proteinG: item.proteinG,
                        carbohydrateG: item.carbohydrateG,
                        fatG: item.fatG,
                        notes: item.notes,
                        alternativeGroup: item.alternativeGroup,
                        isAlternative: item.isAlternative,
                        sortOrder: item.sortOrder ?? itemIndex,
                      })),
                    },
                  })),
                },
              })),
            },
          },
        },
      },
      select: { id: true, name: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "El plan contiene datos inválidos", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/nutrition/plans failed", error);
    return (
      nutritionDatabaseError(error) ??
      NextResponse.json({ error: "No se pudo crear el plan" }, { status: 500 })
    );
  }
}
