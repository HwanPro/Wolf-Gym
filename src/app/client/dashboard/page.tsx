"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import ProfileModal from "@/ui/components/ProfileModal";
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Crown,
  Dumbbell,
  Edit2,
  LogOut,
  Phone,
  Salad,
  ShieldAlert,
} from "lucide-react";
import RoutineTab from "@/ui/components/RoutineTab";
import NutricionTab from "@/ui/components/NutricionTab";

interface Membership {
  membership_type: string;
  membership_duration: number;
}

interface UserMembership {
  membership: Membership;
  assignedAt: string;
}

interface Attendance {
  checkInTime: string;
  checkOutTime?: string | null;
}

interface ClientProfile {
  profile_first_name: string | null;
  profile_last_name: string | null;
  profile_plan: string | null;
  profile_start_date: string | null;
  profile_end_date: string | null;
  profile_emergency_phone: string | null;
  profile_phone: string | null;
  documentNumber?: string | null;
  debt?: string | number | null;
  gender?: "male" | "female";
}

interface ClientData {
  id: string;
  username: string;
  name: string;
  lastName: string;
  phoneNumber: string;
  image: string | null;
  role: string;
  profile?: ClientProfile | null;
  memberships?: UserMembership[];
  attendances?: Attendance[];
}

interface SubscriptionState {
  active: boolean;
  plan: string;
  startDate: Date | null;
  endDate: Date | null;
}

function formatDate(date?: Date | string | null) {
  if (!date) return "Sin fecha";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function getDaysRemaining(endDate: Date | null) {
  if (!endDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
}

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.charAt(0) || "W"}${lastName?.charAt(0) || "G"}`.toUpperCase();
}

export default function ClientDashboard() {
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fitnessGoal, setFitnessGoal] = useState<string>("strength");
  const [bodyFocus, setBodyFocus] = useState<string>("full");
  const router = useRouter();

  const fetchClientData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) { router.push("/"); return; }
        throw new Error(data?.error || "Error al obtener datos del cliente");
      }
      setClientData(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error al cargar datos");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchClientData();
    const interval = window.setInterval(fetchClientData, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchClientData]);

  const subscription: SubscriptionState = useMemo(() => {
    if (clientData?.memberships?.length) {
      const membership = clientData.memberships[0];
      const startDate = new Date(membership.assignedAt);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + membership.membership.membership_duration);
      return { active: endDate.getTime() >= Date.now(), plan: membership.membership.membership_type, startDate, endDate };
    }
    if (clientData?.profile?.profile_plan && clientData.profile.profile_end_date) {
      const startDate = clientData.profile.profile_start_date ? new Date(clientData.profile.profile_start_date) : null;
      const endDate = new Date(clientData.profile.profile_end_date);
      return { active: endDate.getTime() >= new Date().setHours(0, 0, 0, 0), plan: clientData.profile.profile_plan, startDate, endDate };
    }
    return { active: false, plan: "Sin plan", startDate: null, endDate: null };
  }, [clientData]);

  const weeklyProgress = useMemo(() => {
    if (!clientData?.attendances?.length) return 0;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    return clientData.attendances.filter((attendance) => {
      const checkIn = new Date(attendance.checkInTime);
      return checkIn >= startOfWeek && checkIn <= now;
    }).length;
  }, [clientData?.attendances]);

  if (isLoading) {
    return (
      <main className="wolf-app grid place-items-center p-4">
        <div className="w-full max-w-3xl space-y-3" aria-label="Cargando perfil">
          <div className="h-16 animate-pulse rounded-xl bg-[var(--wolf-app-surface)]" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-44 animate-pulse rounded-xl bg-[var(--wolf-app-surface)]" />
            <div className="h-44 animate-pulse rounded-xl bg-[var(--wolf-app-surface)]" />
          </div>
          <p className="wolf-loading">Cargando tu panel...</p>
        </div>
      </main>
    );
  }

  if (!clientData || errorMessage) {
    return (
      <main className="wolf-app grid place-items-center p-6">
        <div className="wolf-panel max-w-sm p-7 text-center">
          <ShieldAlert className="wolf-tone-danger mx-auto mb-3 h-8 w-8" />
          <h1 className="text-lg font-bold">No se pudo cargar tu perfil</h1>
          <p className="my-3 text-[13px] text-[var(--wolf-app-muted)]">{errorMessage || "Sesión no disponible"}</p>
          <Button
            className="wolf-button wolf-button-primary"
            onClick={fetchClientData}
          >
            Reintentar
          </Button>
        </div>
      </main>
    );
  }

  const firstName = clientData.profile?.profile_first_name || clientData.name;
  const lastName = clientData.profile?.profile_last_name || clientData.lastName;
  const daysRemaining = getDaysRemaining(subscription.endDate);
  const debt = Number(clientData.profile?.debt || 0);

  return (
    <main className="wolf-app">
      <header className="wolf-topbar">
        <div className="wolf-topbar-inner">
          <Link href="/client/dashboard" className="wolf-brand-link">
            <span className="wolf-brand-mark">WG</span>
            <span>Mi Wolf Gym</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="wolf-button hidden sm:inline-flex">
              <ChevronLeft className="h-4 w-4" />Inicio
            </Link>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              aria-label="Editar perfil"
              title="Editar perfil"
              className="wolf-button wolf-button-primary"
            >
              <Edit2 className="h-4 w-4" /><span className="hidden sm:inline">Editar perfil</span>
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="wolf-button"
            >
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="wolf-shell max-w-[1152px]">
        <div className="wolf-page-heading">
          <div>
            <p className="wolf-kicker">Área personal</p>
            <h1 className="wolf-title">Hola, {firstName}</h1>
            <p className="wolf-subtitle">Tu membresía, entrenamiento y nutrición en un solo lugar.</p>
          </div>
          <Link href="/" className="wolf-button sm:hidden">
            <ChevronLeft className="h-4 w-4" />Volver al inicio
          </Link>
        </div>

        <section className="wolf-profile-grid">
          <div className="wolf-panel p-5 sm:p-6">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div
                className="grid h-[84px] w-[84px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[var(--wolf-app-accent)] bg-[var(--wolf-app-accent)]"
                style={clientData.image ? { backgroundImage: `url(${clientData.image})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
                role={clientData.image ? "img" : undefined}
                aria-label={clientData.image ? `Foto de ${firstName} ${lastName}` : undefined}
              >
                {!clientData.image && (
                  <span className="text-2xl font-extrabold text-[var(--wolf-app-bg)]">
                    {getInitials(firstName, lastName)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <span className={`wolf-chip mb-2 ${subscription.active ? "wolf-tone-success" : "wolf-tone-danger"}`}>
                  {subscription.active ? "Membresía vigente" : "Membresía pendiente"}
                </span>
                <h2 className="m-0 break-words text-2xl font-extrabold leading-tight sm:text-3xl">
                  {firstName} {lastName}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="wolf-chip">
                    <Phone className="h-3 w-3 text-[var(--wolf-app-accent)]" />
                    {clientData.profile?.profile_phone || clientData.phoneNumber || "Sin teléfono"}
                  </span>
                  <span className="wolf-chip">
                    DNI {clientData.profile?.documentNumber || "no registrado"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <StatusTile icon={<Crown className="h-4 w-4" />} label="Plan" value={subscription.plan} />
            <StatusTile icon={<CalendarDays className="h-4 w-4" />} label="Vence" value={formatDate(subscription.endDate)} />
            <StatusTile icon={<Clock className="h-4 w-4" />} label="Días restantes" value={`${daysRemaining}`} tone={daysRemaining <= 7 ? "warn" : "ok"} />
          </div>
        </section>

        <section className="wolf-info-grid">
          <InfoBand label="Entrenos esta semana" value={`${weeklyProgress}/3`} />
          <InfoBand label="Inicio de membresía" value={formatDate(subscription.startDate)} />
          <InfoBand label="Deuda" value={`S/. ${debt.toFixed(2)}`} tone={debt > 0 ? "warn" : "default"} />
        </section>

        {isProfileModalOpen && (
          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setProfileModalOpen(false)}
            onSuccess={fetchClientData}
            userName={clientData.username}
            firstName={firstName}
            userLastName={lastName}
            userPhone={clientData.profile?.profile_phone || ""}
            userEmergencyPhone={clientData.profile?.profile_emergency_phone || ""}
            userRole={clientData.role}
            profileImage={clientData.image}
          />
        )}

        {subscription.active ? (
          <section className="wolf-panel overflow-hidden">
            <Tabs defaultValue="routines" className="w-full">
              <TabsList className="grid h-auto grid-cols-2 rounded-none border-b border-[var(--wolf-app-border)] !bg-[var(--wolf-app-bg)] p-1.5">
                <TabsTrigger value="routines" className="wolf-product-tab min-h-11 gap-2 rounded-md shadow-none">
                  <Dumbbell className="h-4 w-4" />Rutinas
                </TabsTrigger>
                <TabsTrigger value="nutrition" className="wolf-product-tab min-h-11 gap-2 rounded-md shadow-none">
                  <Salad className="h-4 w-4" />Nutrición
                </TabsTrigger>
              </TabsList>
              <TabsContent value="routines" className="m-0">
                <RoutineTab gender={clientData.profile?.gender || "male"} fitnessGoal={fitnessGoal} bodyFocus={bodyFocus} setFitnessGoal={setFitnessGoal} setBodyFocus={setBodyFocus} />
              </TabsContent>
              <TabsContent value="nutrition" className="m-0 p-4 sm:p-6">
                <NutricionTab gender={clientData.profile?.gender || "male"} />
              </TabsContent>
            </Tabs>
          </section>
        ) : (
          <section className="wolf-panel border-red-500/30 bg-red-500/[0.06] p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="wolf-tone-danger mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="mb-1 font-bold text-red-200">Membresía no activa</h2>
                <p className="m-0 text-[13px] text-red-200/70">
                  Acércate a recepción para renovar tu plan y habilitar tus rutinas.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusTile({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "ok" | "warn"; }) {
  const toneClass = tone === "ok" ? "wolf-tone-success" : tone === "warn" ? "wolf-tone-warning" : "";
  return (
    <div className="wolf-panel px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--wolf-app-faint)]">
        {icon}{label}
      </div>
      <p className={`m-0 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function InfoBand({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn"; }) {
  return (
    <div className="wolf-stat">
      <p className="wolf-stat-label">{label}</p>
      <p className={`mt-2 text-xl font-bold ${tone === "warn" ? "wolf-tone-warning" : ""}`}>{value}</p>
    </div>
  );
}
