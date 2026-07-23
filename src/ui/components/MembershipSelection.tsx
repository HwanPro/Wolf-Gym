// src/ui/components/MembershipSelection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  DEFAULT_MEMBERSHIP_PLANS,
  type MembershipPlanView,
} from "@/lib/membershipPlans";

interface MembershipSelectionProps {
  onPlanSelect: (plan: string, startDate: string, endDate: string) => void;
}

export default function MembershipSelection({
  onPlanSelect,
}: MembershipSelectionProps) {
  const [plans, setPlans] = useState<MembershipPlanView[]>(
    DEFAULT_MEMBERSHIP_PLANS,
  );
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch("/api/plans");
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data);
        }
      } catch (error) {
        console.error("Error al cargar planes:", error);
      }
    }

    fetchPlans();
  }, []);

  const plansByName = useMemo(
    () => new Map(plans.map((plan) => [plan.name, plan])),
    [plans],
  );

  const handlePlanSelect = (planName: string, duration: number) => {
    setSelectedPlan(planName);
    const start = new Date();
    const formattedStart = format(start, "yyyy-MM-dd");
    const end = new Date(start);
    end.setDate(end.getDate() + duration * multiplier);
    const formattedEnd = format(end, "yyyy-MM-dd");
    onPlanSelect(planName, formattedStart, formattedEnd);
  };

  const handleMultiplierChange = (newMultiplier: number) => {
    setMultiplier(newMultiplier);
    const plan = selectedPlan ? plansByName.get(selectedPlan) : null;
    if (!plan) return;

    setSelectedPlan(plan.name);
    const start = new Date();
    const formattedStart = format(start, "yyyy-MM-dd");
    const end = new Date(start);
    end.setDate(end.getDate() + plan.durationDays * newMultiplier);
    onPlanSelect(plan.name, formattedStart, format(end, "yyyy-MM-dd"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-yellow-400">
            Membresía
          </p>
          <h3 className="text-base font-bold text-white">
            Selecciona plan y duración
          </h3>
        </div>

        <div className="rounded-md border border-zinc-700 bg-zinc-900 p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400">
              Periodos
            </span>
            <button
              type="button"
              onClick={() =>
                handleMultiplierChange(Math.max(1, multiplier - 1))
              }
              className="grid h-10 w-10 place-items-center rounded-md border border-zinc-700 bg-black text-base font-black text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={multiplier <= 1}
            >
              -
            </button>
            <span className="min-w-8 text-center text-base font-black text-white">
              {multiplier}
            </span>
            <button
              type="button"
              onClick={() => handleMultiplierChange(multiplier + 1)}
              className="grid h-10 w-10 place-items-center rounded-md bg-yellow-400 text-base font-black text-black hover:bg-yellow-300"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {plans.map((plan) => {
          const totalDuration = plan.durationDays * multiplier;
          const totalPrice = plan.price * multiplier;
          const durationText =
            plan.durationDays === 1
              ? multiplier === 1
                ? "1 día"
                : `${multiplier} días`
              : plan.durationDays % 30 === 0 && plan.durationDays < 365
                ? multiplier === 1
                  ? `${plan.durationDays / 30} mes${
                      plan.durationDays / 30 === 1 ? "" : "es"
                    }`
                  : `${(plan.durationDays / 30) * multiplier} meses`
                : multiplier === 1
                  ? `${plan.durationDays} días`
                  : `${totalDuration} días`;

          return (
            <button
              type="button"
              key={plan.name}
              onClick={() => handlePlanSelect(plan.name, plan.durationDays)}
              className={`rounded-md border p-3 text-left transition-colors ${
                selectedPlan === plan.name
                  ? "border-yellow-400 bg-yellow-400 text-black shadow-sm"
                  : "border-zinc-700 bg-zinc-900 text-white hover:border-yellow-400"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{plan.name}</p>
                  <p
                    className={`mt-1 text-xs ${
                      selectedPlan === plan.name
                        ? "text-black/70"
                        : "text-zinc-400"
                    }`}
                  >
                    {durationText}
                  </p>
                </div>
                <p className="shrink-0 text-base font-black">S/{totalPrice}</p>
              </div>
              <div className="mt-2 min-h-4">
                {multiplier > 1 && (
                  <p
                    className={`text-xs ${
                      selectedPlan === plan.name
                        ? "text-black/70"
                        : "text-yellow-400"
                    }`}
                  >
                    {plan.durationDays} días x {multiplier} = {totalDuration}{" "}
                    días
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
