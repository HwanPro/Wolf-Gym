"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChefHat, Clock3, Salad, ShieldCheck, UserRound } from "lucide-react";

interface MealItem {
  id: string;
  name: string;
  quantity?: string | number | null;
  unit?: string | null;
  displayAmount?: string | null;
  notes?: string | null;
  isAlternative: boolean;
  alternativeGroup?: string | null;
}

interface Meal {
  id: string;
  name: string;
  suggestedTime?: string | null;
  instructions?: string | null;
  items: MealItem[];
}

interface PlanDay {
  id: string;
  dayIndex: number;
  label?: string | null;
  notes?: string | null;
  meals: Meal[];
}

interface Assignment {
  id: string;
  startsAt: string;
  endsAt?: string | null;
  notes?: string | null;
  version: {
    version: number;
    mode: string;
    energyMode: string;
    targetCalories?: number | null;
    targetProteinG?: string | number | null;
    targetCarbohydrateG?: string | number | null;
    targetFatG?: string | number | null;
    targetFiberG?: string | number | null;
    professionalNotes?: string | null;
    professionalName?: string | null;
    professionalRegistration?: string | null;
    plan: { name: string; description?: string | null; objective: string };
    days: PlanDay[];
  };
}

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const objectiveLabels: Record<string, string> = {
  FAT_LOSS: "Pérdida de grasa",
  MAINTENANCE: "Mantenimiento",
  MUSCLE_GAIN: "Ganancia muscular",
  PERFORMANCE: "Rendimiento",
  HEALTH_HABITS: "Hábitos saludables",
  CUSTOM: "Objetivo personalizado",
};
const modeLabels: Record<string, string> = {
  QUANTIFIED: "Cantidades exactas",
  PORTIONS: "Medidas caseras",
  QUALITATIVE: "Referencias visuales",
  HYBRID: "Plan híbrido",
};
const unitLabels: Record<string, string> = {
  GRAM: "g",
  MILLILITER: "ml",
  PORTION: "porción",
  UNIT: "unidad",
  CUP: "taza",
  TABLESPOON: "cda.",
  TEASPOON: "cdta.",
  VISUAL: "referencia visual",
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha final";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatAmount(item: MealItem) {
  const exact = item.quantity && item.unit ? `${Number(item.quantity)} ${unitLabels[item.unit] ?? item.unit}` : "";
  return [exact, item.displayAmount].filter(Boolean).join(" · ") || "Según indicación";
}

export default function NutritionTab() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(today);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/nutrition/current", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el plan nutricional");
        if (active) {
          setAssignment(data.assignment ?? null);
          const availableDays: PlanDay[] = data.assignment?.version?.days ?? [];
          if (availableDays.length && !availableDays.some((day) => day.dayIndex === today)) {
            setSelectedDay(availableDays[0].dayIndex);
          }
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Error de carga");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [today]);

  const currentDay = useMemo(
    () => assignment?.version.days.find((day) => day.dayIndex === selectedDay) ?? assignment?.version.days[0],
    [assignment, selectedDay],
  );

  if (loading) return <div className="wolf-loading p-8">Cargando tu plan alimentario...</div>;
  if (error) return <div className="rounded-md border border-red-500/30 bg-red-500/[0.06] p-5 text-sm text-red-200">{error}</div>;

  if (!assignment) {
    return (
      <div className="wolf-empty rounded-md border border-dashed border-[var(--wolf-app-border)] p-8 text-center">
        <Salad className="mx-auto mb-3 h-8 w-8 text-[var(--wolf-app-accent)]" />
        <h3 className="mb-1 font-bold text-[var(--wolf-app-text)]">Aún no tienes un plan asignado</h3>
        <p className="mx-auto max-w-md text-sm">Solicita una evaluación para recibir un plan ajustado a tu objetivo, preferencias y restricciones.</p>
      </div>
    );
  }

  const { version } = assignment;
  const macros = [
    ["Proteína", version.targetProteinG, "g"],
    ["Carbohidratos", version.targetCarbohydrateG, "g"],
    ["Grasas", version.targetFatG, "g"],
    ["Fibra", version.targetFiberG, "g"],
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <div>
          <p className="wolf-kicker">Tu plan vigente · versión {version.version}</p>
          <h2 className="wolf-title mt-1 text-2xl">{version.plan.name}</h2>
          <p className="wolf-subtitle mt-2 max-w-2xl">{version.plan.description || "Plan alimentario personalizado para tu seguimiento diario."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="wolf-badge">{objectiveLabels[version.plan.objective] ?? version.plan.objective}</span>
            <span className="wolf-badge">{modeLabels[version.mode] ?? version.mode}</span>
            <span className="wolf-badge"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(assignment.startsAt)} - {formatDate(assignment.endsAt)}</span>
          </div>
        </div>
        <div className="wolf-stat">
          <span className="wolf-stat-label">Meta energética</span>
          <strong className="wolf-stat-value text-[var(--wolf-app-accent)]">{version.targetCalories ? `${version.targetCalories} kcal` : "Sin conteo"}</strong>
          <span className="wolf-stat-helper">{version.energyMode === "CALCULATED" ? "Referencia calculada" : version.energyMode === "MANUAL" ? "Definida por el profesional" : "Plan basado en porciones y calidad"}</span>
        </div>
      </section>

      {macros.length > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Objetivos de macronutrientes">
          {macros.map(([label, value, unit]) => <div className="wolf-stat" key={String(label)}><span className="wolf-stat-label">{label}</span><strong className="text-lg">{Number(value)} {unit}</strong></div>)}
        </section>
      )}

      <section className="border-y border-[var(--wolf-app-border)] py-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Días del plan">
          {version.days.map((day) => (
            <button key={day.id} type="button" role="tab" aria-selected={currentDay?.id === day.id} onClick={() => setSelectedDay(day.dayIndex)} className={`wolf-button ${currentDay?.id === day.id ? "wolf-button-primary" : ""}`} title={`Ver comidas del ${day.label || dayNames[day.dayIndex]}`}>
              {day.dayIndex === today ? "Hoy · " : ""}{day.label || dayNames[day.dayIndex]}
            </button>
          ))}
        </div>
      </section>

      {currentDay && (
        <section>
          <div className="mb-4"><p className="wolf-kicker">{currentDay.label || dayNames[currentDay.dayIndex]}</p><h3 className="wolf-panel-title mt-1">Comidas del día</h3>{currentDay.notes && <p className="wolf-subtitle mt-1">{currentDay.notes}</p>}</div>
          <div className="divide-y divide-[var(--wolf-app-border)] border-y border-[var(--wolf-app-border)]">
            {currentDay.meals.map((meal) => (
              <article key={meal.id} className="grid gap-3 py-5 md:grid-cols-[170px_minmax(0,1fr)]">
                <div>
                  <h4 className="flex items-center gap-2 font-bold"><ChefHat className="h-4 w-4 text-[var(--wolf-app-accent)]" />{meal.name}</h4>
                  {meal.suggestedTime && <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--wolf-app-faint)]"><Clock3 className="h-3.5 w-3.5" />{meal.suggestedTime}</p>}
                </div>
                <div>
                  <ul className="space-y-2">
                    {meal.items.map((item) => (
                      <li key={item.id} className="flex flex-col justify-between gap-1 rounded-md bg-[var(--wolf-app-surface-raised)] px-3 py-2.5 sm:flex-row sm:items-center">
                        <div><span className="font-semibold">{item.name}</span>{item.notes && <p className="mt-0.5 text-xs text-[var(--wolf-app-faint)]">{item.notes}</p>}</div>
                        <span className="text-sm text-[var(--wolf-app-muted)]">{formatAmount(item)}</span>
                      </li>
                    ))}
                  </ul>
                  {meal.instructions && <p className="mt-2 text-xs text-[var(--wolf-app-muted)]">{meal.instructions}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(version.professionalNotes || version.professionalName) && (
        <section className="rounded-md border border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface-raised)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><UserRound className="h-4 w-4 text-[var(--wolf-app-accent)]" />Indicaciones profesionales</h3>
          {version.professionalNotes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--wolf-app-muted)]">{version.professionalNotes}</p>}
          {version.professionalName && <p className="mt-3 text-xs text-[var(--wolf-app-faint)]">{version.professionalName}{version.professionalRegistration ? ` · ${version.professionalRegistration}` : ""}</p>}
        </section>
      )}

      <p className="flex items-start gap-2 text-xs leading-5 text-[var(--wolf-app-faint)]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Este plan es una intervención asignada. No cambies cantidades ni suplementos por una condición médica sin consultar al profesional responsable.</p>
    </div>
  );
}
