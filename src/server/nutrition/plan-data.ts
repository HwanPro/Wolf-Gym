import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { nutritionPlanInputSchema } from '@/domain/nutrition/nutrition-policy';
export function nutritionVersionData(input: z.infer<typeof nutritionPlanInputSchema>, version: number) { return {
            version,
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
}; }
