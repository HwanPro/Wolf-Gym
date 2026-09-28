"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  Plus,
  Salad,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";

type PlanMode = "QUANTIFIED" | "PORTIONS" | "QUALITATIVE" | "HYBRID";
type EnergyMode = "CALCULATED" | "MANUAL" | "NOT_TRACKED";

interface ItemDraft {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  displayAmount: string;
  notes: string;
}

interface MealDraft {
  key: string;
  name: string;
  time: string;
  items: ItemDraft[];
}

interface DayDraft {
  key: string;
  dayIndex: number;
  label: string;
  meals: MealDraft[];
}

interface PlanSummary {
  id: string;
  name: string;
  description?: string | null;
  objective: string;
  versions: Array<{
    id: string;
    version: number;
    mode: PlanMode;
    energyMode: EnergyMode;
    targetCalories?: number | null;
    durationWeeks?: number | null;
    professionalName?: string | null;
    _count: { assignments: number; days: number };
  }>;
}

interface ClientOption {
  user_id: string;
  profile_first_name?: string | null;
  profile_last_name?: string | null;
  user: { username: string; role: string };
}

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const modeLabels: Record<PlanMode, string> = {
  QUANTIFIED: "Por gramos",
  PORTIONS: "Por porciones",
  QUALITATIVE: "Sin pesar",
  HYBRID: "Híbrido",
};

function key() {
  return crypto.randomUUID();
}

function newItem(): ItemDraft {
  return { key: key(), name: "", quantity: "", unit: "GRAM", displayAmount: "", notes: "" };
}

function newMeal(name = "Desayuno"): MealDraft {
  return { key: key(), name, time: "08:00", items: [newItem()] };
}

function newDay(dayIndex = 1): DayDraft {
  return { key: key(), dayIndex, label: dayNames[dayIndex], meals: [newMeal()] };
}

function optionalNumber(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : undefined;
}

export default function AdminNutritionPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("MAINTENANCE");
  const [mode, setMode] = useState<PlanMode>("HYBRID");
  const [energyMode, setEnergyMode] = useState<EnergyMode>("NOT_TRACKED");
  const [targetCalories, setTargetCalories] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("4");
  const [professionalName, setProfessionalName] = useState("");
  const [professionalRegistration, setProfessionalRegistration] = useState("");
  const [professionalNotes, setProfessionalNotes] = useState("");
  const [days, setDays] = useState<DayDraft[]>([newDay()]);

  const [planId, setPlanId] = useState("");
  const [clientId, setClientId] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [usesBodyWeight, setUsesBodyWeight] = useState(false);
  const [weightKg, setWeightKg] = useState("");
  const [allergies, setAllergies] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [consent, setConsent] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansResponse, clientsResponse] = await Promise.all([
        fetch("/api/admin/nutrition/plans", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }),
      ]);
      const planData = await plansResponse.json().catch(() => ({}));
      const clientData = await clientsResponse.json().catch(() => []);
      if (!plansResponse.ok) {
        throw new Error(planData.error || "No se pudieron cargar los planes alimentarios");
      }
      if (!clientsResponse.ok) throw new Error("No se pudo cargar la lista de clientes");
      setPlans(planData.items ?? []);
      setClients((clientData ?? []).filter((client: ClientOption) => client.user?.role === "client"));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Error de carga" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const nextAvailableDay = useMemo(
    () => [1, 2, 3, 4, 5, 6, 0].find((candidate) => !days.some((day) => day.dayIndex === candidate)),
    [days],
  );

  function updateDay(dayKey: string, updater: (day: DayDraft) => DayDraft) {
    setDays((current) => current.map((day) => (day.key === dayKey ? updater(day) : day)));
  }

  function addMeal(dayKey: string) {
    updateDay(dayKey, (day) => ({ ...day, meals: [...day.meals, newMeal(`Comida ${day.meals.length + 1}`)] }));
  }

  function updateMeal(dayKey: string, mealKey: string, updater: (meal: MealDraft) => MealDraft) {
    updateDay(dayKey, (day) => ({
      ...day,
      meals: day.meals.map((meal) => (meal.key === mealKey ? updater(meal) : meal)),
    }));
  }

  function updateItem(dayKey: string, mealKey: string, itemKey: string, patch: Partial<ItemDraft>) {
    updateMeal(dayKey, mealKey, (meal) => ({
      ...meal,
      items: meal.items.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)),
    }));
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/nutrition/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          objective,
          mode,
          energyMode,
          targetCalories: energyMode === "NOT_TRACKED" ? undefined : optionalNumber(targetCalories),
          durationWeeks: optionalNumber(durationWeeks),
          professionalName: professionalName || undefined,
          professionalRegistration: professionalRegistration || undefined,
          professionalNotes: professionalNotes || undefined,
          publish: true,
          days: days.map((day) => ({
            dayIndex: day.dayIndex,
            label: day.label || dayNames[day.dayIndex],
            meals: day.meals.map((meal, mealIndex) => ({
              name: meal.name,
              suggestedTime: meal.time || undefined,
              sortOrder: mealIndex,
              items: meal.items.map((item, itemIndex) => ({
                name: item.name,
                quantity: optionalNumber(item.quantity),
                unit: item.quantity ? item.unit : undefined,
                displayAmount: item.displayAmount || undefined,
                notes: item.notes || undefined,
                sortOrder: itemIndex,
              })),
            })),
          })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo crear el plan");
      setMessage({ tone: "ok", text: `Plan “${result.name}” creado y publicado.` });
      setName("");
      setDescription("");
      setDays([newDay()]);
      await loadData();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function assignPlan(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/nutrition/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: clientId,
          planId,
          startsAt: new Date(`${startsAt}T00:00:00`).toISOString(),
          endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : undefined,
          assessment: {
            usesBodyWeight,
            currentWeightKg: usesBodyWeight ? optionalNumber(weightKg) : undefined,
            allergies: allergies.split(",").map((value) => value.trim()).filter(Boolean),
            dietaryRestrictions: restrictions.split(",").map((value) => value.trim()).filter(Boolean),
            dislikedFoods: [],
            objective: plans.find((plan) => plan.id === planId)?.objective,
            consentToHealthData: consent,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo asignar el plan");
      setMessage({ tone: "ok", text: "Plan asignado correctamente al cliente." });
      setClientId("");
      setWeightKg("");
      setAllergies("");
      setRestrictions("");
      setConsent(false);
      await loadData();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Error al asignar" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="wolf-app min-h-screen">
      <div className="wolf-shell space-y-5">
        <header className="wolf-page-heading">
          <div>
            <p className="wolf-kicker">Nutrición</p>
            <h1 className="wolf-title flex items-center gap-2"><Salad className="h-7 w-7 text-[var(--wolf-app-accent)]" />Planes alimentarios</h1>
            <p className="wolf-subtitle">Crea planes por gramos, porciones o referencias visuales y asígnalos por versión.</p>
          </div>
          <Link href="/admin/dashboard" className="wolf-button" title="Volver al panel administrativo">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </header>

        {message && (
          <div className={`rounded-md border px-4 py-3 text-sm ${message.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`} role="status">
            {message.text}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
          <form className="wolf-panel overflow-hidden" onSubmit={createPlan}>
            <div className="wolf-panel-header">
              <div>
                <h2 className="wolf-panel-title flex items-center gap-2"><ClipboardList className="h-5 w-5" />Constructor de plan</h2>
                <p className="wolf-subtitle">Una publicación crea una versión inmutable lista para asignar.</p>
              </div>
              <button className="wolf-button wolf-button-primary" disabled={saving} title="Guardar y publicar este plan">
                <Save className="h-4 w-4" /> {saving ? "Guardando" : "Publicar plan"}
              </button>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <Field label="Nombre" className="sm:col-span-2">
                <input className="wolf-control" value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan de mantenimiento" required />
              </Field>
              <Field label="Objetivo">
                <select className="wolf-control" value={objective} onChange={(event) => setObjective(event.target.value)}>
                  <option value="FAT_LOSS">Pérdida de grasa</option><option value="MAINTENANCE">Mantenimiento</option>
                  <option value="MUSCLE_GAIN">Ganancia muscular</option><option value="PERFORMANCE">Rendimiento</option>
                  <option value="HEALTH_HABITS">Hábitos saludables</option><option value="CUSTOM">Personalizado</option>
                </select>
              </Field>
              <Field label="Modalidad">
                <select className="wolf-control" value={mode} onChange={(event) => setMode(event.target.value as PlanMode)}>
                  {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Descripción" className="sm:col-span-2 lg:col-span-4">
                <textarea className="wolf-control min-h-20 py-2" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto y alcance general del plan" />
              </Field>
              <Field label="Control energético">
                <select className="wolf-control" value={energyMode} onChange={(event) => setEnergyMode(event.target.value as EnergyMode)}>
                  <option value="NOT_TRACKED">Sin contar calorías</option><option value="MANUAL">Meta manual</option><option value="CALCULATED">Meta calculada</option>
                </select>
              </Field>
              <Field label="Calorías objetivo">
                <input className="wolf-control" type="number" min="1" value={targetCalories} onChange={(event) => setTargetCalories(event.target.value)} disabled={energyMode === "NOT_TRACKED"} placeholder="Ej. 2200" />
              </Field>
              <Field label="Duración (semanas)">
                <input className="wolf-control" type="number" min="1" max="104" value={durationWeeks} onChange={(event) => setDurationWeeks(event.target.value)} />
              </Field>
              <Field label="Profesional">
                <input className="wolf-control" value={professionalName} onChange={(event) => setProfessionalName(event.target.value)} placeholder="Nombre completo" />
              </Field>
              <Field label="Colegiatura / registro">
                <input className="wolf-control" value={professionalRegistration} onChange={(event) => setProfessionalRegistration(event.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="Indicaciones generales" className="sm:col-span-2 lg:col-span-3">
                <textarea className="wolf-control min-h-20 py-2" value={professionalNotes} onChange={(event) => setProfessionalNotes(event.target.value)} placeholder="Hidratación, preparación, sustituciones y seguimiento" />
              </Field>
            </div>

            <div className="border-t border-[var(--wolf-app-border)] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold">Semana alimentaria</h3><p className="wolf-subtitle">Agrega únicamente los días necesarios; puedes usar un día como plantilla general.</p></div>
                <button type="button" className="wolf-button" disabled={nextAvailableDay === undefined} onClick={() => nextAvailableDay !== undefined && setDays((current) => [...current, newDay(nextAvailableDay)])} title="Agregar otro día al plan">
                  <CalendarPlus className="h-4 w-4" /> Agregar día
                </button>
              </div>

              <div className="space-y-4">
                {days.map((day) => (
                  <div key={day.key} className="rounded-md border border-[var(--wolf-app-border)] bg-[var(--wolf-app-bg)] p-3 sm:p-4">
                    <div className="mb-3 flex flex-wrap items-end gap-3">
                      <Field label="Día" className="min-w-44 flex-1">
                        <select className="wolf-control" value={day.dayIndex} onChange={(event) => updateDay(day.key, (current) => ({ ...current, dayIndex: Number(event.target.value), label: dayNames[Number(event.target.value)] }))}>
                          {dayNames.map((label, index) => <option key={label} value={index} disabled={days.some((other) => other.key !== day.key && other.dayIndex === index)}>{label}</option>)}
                        </select>
                      </Field>
                      <button type="button" className="wolf-icon-button" onClick={() => days.length > 1 && setDays((current) => current.filter((currentDay) => currentDay.key !== day.key))} disabled={days.length === 1} title="Eliminar este día" aria-label="Eliminar día"><Trash2 className="h-4 w-4" /></button>
                    </div>

                    <div className="space-y-3">
                      {day.meals.map((meal) => (
                        <div key={meal.key} className="border-t border-[var(--wolf-app-border)] pt-3 first:border-0 first:pt-0">
                          <div className="grid gap-3 sm:grid-cols-[minmax(160px,1fr)_130px_auto]">
                            <Field label="Comida"><input className="wolf-control" value={meal.name} onChange={(event) => updateMeal(day.key, meal.key, (current) => ({ ...current, name: event.target.value }))} required /></Field>
                            <Field label="Hora"><input className="wolf-control" type="time" value={meal.time} onChange={(event) => updateMeal(day.key, meal.key, (current) => ({ ...current, time: event.target.value }))} /></Field>
                            <button type="button" className="wolf-icon-button self-end" disabled={day.meals.length === 1} onClick={() => updateDay(day.key, (current) => ({ ...current, meals: current.meals.filter((currentMeal) => currentMeal.key !== meal.key) }))} title="Eliminar comida" aria-label="Eliminar comida"><Trash2 className="h-4 w-4" /></button>
                          </div>

                          <div className="mt-3 space-y-2">
                            {meal.items.map((item) => (
                              <div key={item.key} className="grid gap-2 md:grid-cols-[minmax(170px,1.4fr)_100px_135px_minmax(150px,1fr)_40px]">
                                <input className="wolf-control" value={item.name} onChange={(event) => updateItem(day.key, meal.key, item.key, { name: event.target.value })} placeholder="Alimento o preparación" required aria-label="Alimento" />
                                <input className="wolf-control" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(day.key, meal.key, item.key, { quantity: event.target.value })} placeholder="Cant." aria-label="Cantidad" />
                                <select className="wolf-control" value={item.unit} onChange={(event) => updateItem(day.key, meal.key, item.key, { unit: event.target.value })} aria-label="Unidad">
                                  <option value="GRAM">gramos</option><option value="MILLILITER">mililitros</option><option value="PORTION">porción</option><option value="UNIT">unidad</option><option value="CUP">taza</option><option value="TABLESPOON">cucharada</option><option value="TEASPOON">cucharadita</option><option value="VISUAL">visual</option>
                                </select>
                                <input className="wolf-control" value={item.displayAmount} onChange={(event) => updateItem(day.key, meal.key, item.key, { displayAmount: event.target.value })} placeholder="Ej. 1/2 plato" aria-label="Referencia visual" />
                                <button type="button" className="wolf-icon-button" disabled={meal.items.length === 1} onClick={() => updateMeal(day.key, meal.key, (current) => ({ ...current, items: current.items.filter((currentItem) => currentItem.key !== item.key) }))} title="Eliminar alimento" aria-label="Eliminar alimento"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            ))}
                            <button type="button" className="wolf-button" onClick={() => updateMeal(day.key, meal.key, (current) => ({ ...current, items: [...current.items, newItem()] }))} title="Agregar alimento a esta comida"><Plus className="h-4 w-4" /> Alimento</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="wolf-button mt-3" onClick={() => addMeal(day.key)} title="Agregar otra comida a este día"><Plus className="h-4 w-4" /> Comida</button>
                  </div>
                ))}
              </div>
            </div>
          </form>

          <aside className="space-y-5">
            <form className="wolf-panel p-4 sm:p-5" onSubmit={assignPlan}>
              <h2 className="wolf-panel-title flex items-center gap-2"><UserPlus className="h-5 w-5" />Asignar a cliente</h2>
              <p className="wolf-subtitle mb-4">La asignación conserva exactamente la versión publicada.</p>
              <div className="space-y-3">
                <Field label="Plan"><select className="wolf-control" value={planId} onChange={(event) => setPlanId(event.target.value)} required><option value="">Seleccionar</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field>
                <Field label="Cliente"><select className="wolf-control" value={clientId} onChange={(event) => setClientId(event.target.value)} required><option value="">Seleccionar</option>{clients.map((client) => <option key={client.user_id} value={client.user_id}>{client.profile_first_name || client.user.username} {client.profile_last_name || ""}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="Inicio"><input className="wolf-control" type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></Field><Field label="Fin"><input className="wolf-control" type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field></div>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--wolf-app-border)] px-3 text-sm"><input type="checkbox" checked={usesBodyWeight} onChange={(event) => setUsesBodyWeight(event.target.checked)} /> Usar peso en la evaluación</label>
                {usesBodyWeight && <Field label="Peso actual (kg)"><input className="wolf-control" type="number" min="25" max="400" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} required /></Field>}
                <Field label="Alergias"><input className="wolf-control" value={allergies} onChange={(event) => setAllergies(event.target.value)} placeholder="Separadas por comas" /></Field>
                <Field label="Restricciones"><input className="wolf-control" value={restrictions} onChange={(event) => setRestrictions(event.target.value)} placeholder="Vegetariano, sin lactosa..." /></Field>
                <label className="flex items-start gap-3 rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs leading-5 text-[var(--wolf-app-muted)]"><input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Confirmo que el cliente autorizó registrar sus datos nutricionales y de salud.</label>
                <button className="wolf-button wolf-button-primary w-full" disabled={saving}><UserPlus className="h-4 w-4" /> Asignar plan</button>
              </div>
            </form>

            <section className="wolf-panel overflow-hidden">
              <div className="wolf-panel-header"><div><h2 className="wolf-panel-title">Planes publicados</h2><p className="wolf-subtitle">{loading ? "Cargando..." : `${plans.length} disponibles`}</p></div></div>
              <div className="divide-y divide-[var(--wolf-app-border)]">
                {plans.map((plan) => {
                  const version = plan.versions[0];
                  return <div key={plan.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><strong>{plan.name}</strong><p className="wolf-subtitle mt-1">{version ? `${modeLabels[version.mode]} · ${version._count.days} días` : "Sin publicar"}</p></div>{version && <span className="wolf-badge">v{version.version}</span>}</div>{version && <p className="mt-2 text-xs text-[var(--wolf-app-faint)]">{version._count.assignments} asignaciones{version.targetCalories ? ` · ${version.targetCalories} kcal` : " · sin conteo energético"}</p>}</div>;
                })}
                {!loading && plans.length === 0 && <p className="wolf-empty p-5">Todavía no hay planes publicados.</p>}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-[11px] font-bold uppercase text-[var(--wolf-app-faint)]">{label}</span>{children}</label>;
}
