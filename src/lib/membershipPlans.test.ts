import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEMBERSHIP_PLANS,
  inferPlanDurationDays,
  toMembershipPlanView,
} from "./membershipPlans";

describe("membership plan mapping", () => {
  it.each([
    ["Plan por día", 1],
    ["Plan por dos meses", 60],
    ["Plan trimestral", 90],
    ["Plan semestral", 180],
    ["Plan anual", 365],
    ["Plan estándar", 30],
  ])("infers %s as %i days", (name, days) => {
    expect(inferPlanDurationDays({ name })).toBe(days);
  });

  it("normalizes accents and reads descriptions and slugs", () => {
    expect(inferPlanDurationDays({ slug: "plan-fin-de-año" })).toBe(365);
    expect(inferPlanDurationDays({ description: "Acceso 3 meses" })).toBe(90);
  });

  it("maps persistence data to a stable public DTO", () => {
    expect(
      toMembershipPlanView({
        id: "plan-1",
        name: "Mensual",
        price: 70.125,
        description: null,
        slug: null,
      }),
    ).toEqual({
      id: "plan-1",
      name: "Mensual",
      price: 70.125,
      description: "",
      slug: "",
      amountCents: 7013,
      durationDays: 30,
    });
  });

  it("keeps safe built-in fallbacks", () => {
    expect(DEFAULT_MEMBERSHIP_PLANS).toHaveLength(4);
    expect(DEFAULT_MEMBERSHIP_PLANS.every((plan) => plan.price >= 0)).toBe(true);
  });
});
