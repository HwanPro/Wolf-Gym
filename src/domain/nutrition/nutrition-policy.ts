import { z } from "zod";

export const nutritionGoals = [
  "FAT_LOSS",
  "MAINTENANCE",
  "MUSCLE_GAIN",
  "PERFORMANCE",
  "HEALTH_HABITS",
  "CUSTOM",
] as const;

export const nutritionPlanModes = [
  "QUANTIFIED",
  "PORTIONS",
  "QUALITATIVE",
  "HYBRID",
] as const;

export const nutritionEnergyModes = [
  "CALCULATED",
  "MANUAL",
  "NOT_TRACKED",
] as const;

export const nutritionQuantityUnits = [
  "GRAM",
  "MILLILITER",
  "PORTION",
  "UNIT",
  "CUP",
  "TABLESPOON",
  "TEASPOON",
  "VISUAL",
] as const;

const optionalPositiveNumber = z.number().positive().finite().optional();

export const nutritionMealItemSchema = z.object({
  foodId: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(160),
  quantity: optionalPositiveNumber,
  unit: z.enum(nutritionQuantityUnits).optional(),
  gramsEquivalent: optionalPositiveNumber,
  displayAmount: z.string().trim().max(120).optional(),
  calories: z.number().nonnegative().finite().max(10_000).optional(),
  proteinG: z.number().nonnegative().finite().max(1_000).optional(),
  carbohydrateG: z.number().nonnegative().finite().max(2_000).optional(),
  fatG: z.number().nonnegative().finite().max(1_000).optional(),
  notes: z.string().trim().max(500).optional(),
  alternativeGroup: z.string().trim().max(80).optional(),
  isAlternative: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100).default(0),
});

export const nutritionMealSchema = z.object({
  name: z.string().trim().min(1).max(100),
  suggestedTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  sortOrder: z.number().int().min(0).max(30).default(0),
  instructions: z.string().trim().max(1_000).optional(),
  items: z.array(nutritionMealItemSchema).min(1).max(30),
});

export const nutritionPlanDaySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  label: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  meals: z.array(nutritionMealSchema).min(1).max(12),
});

export const nutritionPlanInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1_000).optional(),
    objective: z.enum(nutritionGoals),
    mode: z.enum(nutritionPlanModes),
    energyMode: z.enum(nutritionEnergyModes),
    targetCalories: z.number().int().positive().max(10_000).optional(),
    targetProteinG: optionalPositiveNumber,
    targetCarbohydrateG: optionalPositiveNumber,
    targetFatG: optionalPositiveNumber,
    targetFiberG: optionalPositiveNumber,
    durationWeeks: z.number().int().min(1).max(104).optional(),
    professionalNotes: z.string().trim().max(4_000).optional(),
    professionalName: z.string().trim().max(160).optional(),
    professionalRegistration: z.string().trim().max(80).optional(),
    calculationMethod: z.string().trim().max(120).optional(),
    calculationSnapshot: z.record(z.unknown()).optional(),
    publish: z.boolean().default(true),
    days: z.array(nutritionPlanDaySchema).min(1).max(7),
  })
  .superRefine((plan, context) => {
    if (plan.energyMode !== "NOT_TRACKED" && !plan.targetCalories) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetCalories"],
        message: "Las calorías objetivo son necesarias cuando se controla energía.",
      });
    }

    if (new Set(plan.days.map((day) => day.dayIndex)).size !== plan.days.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: "No se puede repetir un día de la semana.",
      });
    }

    plan.days.forEach((day, dayPosition) => {
      day.meals.forEach((meal, mealPosition) => {
        meal.items.forEach((item, itemPosition) => {
          const path = ["days", dayPosition, "meals", mealPosition, "items", itemPosition];
          const hasQuantity = Boolean(item.quantity && item.unit);
          const hasVisualAmount = Boolean(item.displayAmount?.trim());

          if (plan.mode === "QUANTIFIED" && !hasQuantity) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message: "Un plan cuantificado requiere cantidad y unidad.",
            });
          }
          if (plan.mode === "PORTIONS" && !hasQuantity) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message: "Un plan por porciones requiere cantidad y medida casera.",
            });
          }
          if (plan.mode === "QUALITATIVE" && !hasVisualAmount) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message: "Un plan cualitativo requiere una indicación visual.",
            });
          }
          if (plan.mode === "HYBRID" && !hasQuantity && !hasVisualAmount) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message: "Indica una cantidad o una referencia visual.",
            });
          }
        });
      });
    });
  });

export const nutritionAssessmentSchema = z
  .object({
    usesBodyWeight: z.boolean().default(false),
    birthDate: z.string().date().optional(),
    sexForEquation: z.enum(["FEMALE", "MALE"]).optional(),
    heightCm: z.number().min(100).max(250).optional(),
    currentWeightKg: z.number().min(25).max(400).optional(),
    activityLevel: z
      .enum(["SEDENTARY", "LOW_ACTIVE", "ACTIVE", "VERY_ACTIVE"])
      .optional(),
    objective: z.enum(nutritionGoals).optional(),
    allergies: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    dietaryRestrictions: z
      .array(z.string().trim().min(1).max(120))
      .max(30)
      .default([]),
    dislikedFoods: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    consentToHealthData: z.boolean().default(false),
    requiresProfessionalReview: z.boolean().default(false),
  })
  .superRefine((assessment, context) => {
    if (assessment.usesBodyWeight && !assessment.currentWeightKg) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentWeightKg"],
        message: "El peso es necesario cuando se activa el cálculo por peso.",
      });
    }

    const storesSensitiveData = Boolean(
      assessment.birthDate ||
        assessment.sexForEquation ||
        assessment.heightCm ||
        assessment.currentWeightKg ||
        assessment.allergies.length ||
        assessment.dietaryRestrictions.length,
    );
    if (storesSensitiveData && !assessment.consentToHealthData) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consentToHealthData"],
        message: "Se requiere consentimiento para guardar datos de salud.",
      });
    }
  });

export const nutritionAssignmentInputSchema = z.object({
  userId: z.string().cuid(),
  planId: z.string().cuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1_000).optional(),
  assessment: nutritionAssessmentSchema.optional(),
});

export type NutritionPlanInput = z.infer<typeof nutritionPlanInputSchema>;

export function splitListInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
