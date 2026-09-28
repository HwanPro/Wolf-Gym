import { describe, expect, it } from "vitest";

import {
  nutritionAssessmentSchema,
  nutritionPlanInputSchema,
  splitListInput,
} from "./nutrition-policy";

const basePlan = {
  name: "Plan semanal base",
  objective: "MAINTENANCE" as const,
  energyMode: "NOT_TRACKED" as const,
  publish: true,
  days: [
    {
      dayIndex: 1,
      meals: [
        {
          name: "Desayuno",
          items: [{ name: "Avena", displayAmount: "1 bowl", sortOrder: 0 }],
        },
      ],
    },
  ],
};

describe("nutrition plan policy", () => {
  it("accepts a qualitative plan without client body weight", () => {
    const result = nutritionPlanInputSchema.safeParse({
      ...basePlan,
      mode: "QUALITATIVE",
    });

    expect(result.success).toBe(true);
  });

  it("requires quantity for quantified plans", () => {
    const result = nutritionPlanInputSchema.safeParse({
      ...basePlan,
      mode: "QUANTIFIED",
    });

    expect(result.success).toBe(false);
  });

  it("requires a calorie target when energy is tracked", () => {
    const result = nutritionPlanInputSchema.safeParse({
      ...basePlan,
      mode: "QUALITATIVE",
      energyMode: "MANUAL",
    });

    expect(result.success).toBe(false);
  });

  it("requires consent before storing anthropometric or allergy data", () => {
    expect(
      nutritionAssessmentSchema.safeParse({
        usesBodyWeight: true,
        currentWeightKg: 72,
      }).success,
    ).toBe(false);

    expect(
      nutritionAssessmentSchema.safeParse({
        usesBodyWeight: true,
        currentWeightKg: 72,
        consentToHealthData: true,
      }).success,
    ).toBe(true);
  });

  it("normalizes comma-separated preference lists", () => {
    expect(splitListInput("lácteos, maní, , mariscos ")).toEqual([
      "lácteos",
      "maní",
      "mariscos",
    ]);
  });
});
