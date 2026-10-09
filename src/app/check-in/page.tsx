"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import FingerprintCaptureDialog, {
  type FingerprintCapturePhase,
  type FingerprintOperation,
} from "@/features/clients/components/FingerprintCaptureDialog";
import {
  mapActiveAttendanceRows,
  type ActiveGymMember,
  type AttendanceFeedRow,
} from "@/domain/attendance/attendance-feed";

/* ─── Wolf Gym design tokens ─── */
const W = {
  black: "#0A0A0A",
  ink: "#141414",
  graph: "#1C1C1C",
  yellow: "#FFC21A",
  orange: "#FF7A1A",
  danger: "#E5484D",
  success: "#2EBD75",
  lineDark: "rgba(255,194,26,0.15)",
  lineStrong: "rgba(255,194,26,0.35)",
  mutedDark: "rgba(255,255,255,0.60)",
  faintDark: "rgba(255,255,255,0.65)",
} as const;

const swalBase = {
  background: W.black,
  color: "#fff",
  confirmButtonColor: W.yellow,
} as const;

function vibrate(ms = 100) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

function getErrorMessage(error: unknown, fallback = "Inténtalo de nuevo.") {
  return error instanceof Error ? error.message : fallback;
}

/* ─── Types ─── */
type IdentifyResult = {
  ok: boolean;
  match: boolean;
  userId: string | null;
  name?: string;
};
type RegisterResult = {
  ok: boolean;
  action: "checkin" | "checkout" | "already_open";
  type?: "checkin" | "checkout" | "rebote" | "already_open";
  fullName?: string;
  minutesOpen?: number;
  monthlyDebt?: number;
  dailyDebt?: number;
  totalDebt?: number;
  daysLeft?: number;
  plan?: string;
  avatarUrl?: string;
  profileId?: string;
};
type ActivityLog = {
  id: string;
  timestamp: Date;
  fullName: string;
  action: "checkin" | "checkout";
  userId?: string;
  avatarUrl?: string;
  monthlyDebt: number;
  dailyDebt: number;
  totalDebt: number;
  daysLeft?: number;
  plan?: string;
  profileId?: string;
};
type DebtTarget = {
  profileId: string;
  userId?: string;
  fullName?: string;
  plan?: string;
  daysLeft?: number;
  monthlyDebt: number;
  dailyDebt: number;
  totalDebt: number;
};
/* ─── Tiny shared UI pieces ─── */
function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        color: W.yellow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({
  children,
  variant = "yellow",
}: {
  children: React.ReactNode;
  variant?: "yellow" | "neutral" | "success" | "danger" | "inside";
}) {
  const styles: Record<string, React.CSSProperties> = {
    yellow: {
      background: "rgba(255,194,26,0.14)",
      color: W.yellow,
      border: `1px solid rgba(255,194,26,0.35)`,
    },
    neutral: {
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.8)",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    success: {
      background: "rgba(46,189,117,0.12)",
      color: W.success,
      border: "1px solid rgba(46,189,117,0.35)",
    },
    danger: {
      background: "rgba(229,72,77,0.12)",
      color: W.danger,
      border: "1px solid rgba(229,72,77,0.35)",
    },
    inside: {
      background: "rgba(255,194,26,0.14)",
      color: W.yellow,
      border: `1px solid rgba(255,194,26,0.35)`,
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
}

function WolfLogo() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          background: W.yellow,
          color: W.black,
          borderRadius: 8,
          fontWeight: 800,
          fontSize: 14,
          fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
        }}
      >
        W
      </div>
      <span
        style={{
          fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
          fontSize: 22,
          lineHeight: 1,
          letterSpacing: "0.04em",
        }}
      >
        WOLF <span style={{ color: W.yellow }}>GYM</span>
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════
   Main component
════════════════════════════════════════════ */
export default function CheckInPage() {
  const { data: session } = useSession();

  const [mode, setMode] = useState<"kiosk" | "remote">("kiosk");
  const [room, setRoom] = useState("default");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const scanningRef = useRef(false);

  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [activeGymMembers, setActiveGymMembers] = useState<ActiveGymMember[]>(
    [],
  );
  const [showDebtDialog, setShowDebtDialog] = useState(false);
  const debtSending = useRef(false);
  const debtIntent = useRef<{ key: string; productId: string; profileId: string } | null>(null);
  const [debtCatalog, setDebtCatalog] = useState<{ item_id: string; item_name: string; item_price: number; item_discount: number | null; item_stock: number; track_stock: boolean }[]>([]);
  const [selectedClient, setSelectedClient] = useState<DebtTarget | null>(null);
  const [fingerprintCapture, setFingerprintCapture] = useState<{
    open: boolean;
    phase: FingerprintCapturePhase;
    operation: FingerprintOperation;
    image?: string;
  }>({ open: false, phase: "ready", operation: "entrada" });

  const role = session?.user?.role;
  useEffect(() => {
    if (!showDebtDialog || role !== "admin") return;
    setDebtCatalog([]);
    void fetch("/api/products/gym", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("No se pudo cargar el catálogo");
      setDebtCatalog(await response.json());
    }).catch(() => {});
  }, [showDebtDialog, role]);

  useEffect(() => {
    if (role !== "admin") return;
    const controller = new AbortController();
    async function loadHistory() {
      try {
        const response = await fetch("/api/check-in/history?limit=50", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.activityLog)) {
          setActivityLog(data.activityLog.map((item: ActivityLog & { timestamp: string }) => ({ ...item, timestamp: new Date(item.timestamp) })));
        }
      } catch { /* Existing activity stays visible if the request is interrupted. */ }
    }
    void loadHistory();
    return () => controller.abort();
  }, [role]);

  useEffect(() => {
    setMounted(true);
    const sp = new URLSearchParams(window.location.search);
    setMode(sp.get("remote") ? "remote" : "kiosk");
    setRoom(sp.get("room") || "default");
  }, []);

  /* ── active gym members polling ── */
  const refreshActiveGymMembers = async () => {
    try {
      const response = await fetch("/api/attendance", { cache: "no-store" });
      if (!response.ok) return;
      const rows = (await response.json()) as AttendanceFeedRow[];
      setActiveGymMembers(mapActiveAttendanceRows(rows));
    } catch {}
  };

  useEffect(() => {
    if (!mounted || role !== "admin") return;
    refreshActiveGymMembers();
    const timer = setInterval(refreshActiveGymMembers, 30000);
    return () => clearInterval(timer);
  }, [mounted, role]);

  /* ── unified activity feed ── */
  const gymActivity = useMemo(() => {
    const activeProfileIds = new Set(
      activeGymMembers.map((m) => m.profileId).filter(Boolean),
    );
    const activeItems = activeGymMembers.map((m) => ({
      ...m,
      id: `active-${m.profileId}`,
      timestamp: new Date(m.checkInTime),
      action: "checkin" as const,
      status: "Dentro" as const,
    }));
    const recentItems = activityLog
      .filter((log) => !log.profileId || !activeProfileIds.has(log.profileId))
      .slice(0, 12)
      .map((log) => ({
        ...log,
        status:
          log.action === "checkin" ? ("Entrada" as const) : ("Salida" as const),
      }));
    return [...activeItems, ...recentItems];
  }, [activeGymMembers, activityLog]);

  /* ══════════════════ core helpers ══════════════════ */

  /** Accepts 8-digit DNI or 9-digit phone (or 11 with country code 51) */
  const askIdentifier = async (title: string): Promise<string | null> => {
    const { value, isConfirmed } = await Swal.fire({
      ...swalBase,
      title,
      input: "tel",
      inputPlaceholder: "DNI (8 dígitos) o teléfono (9 dígitos)",
      inputAttributes: { maxlength: "11" },
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      preConfirm: (val) => {
        const v = String(val || "").replace(/\D/g, "");
        if (
          v.length !== 8 &&
          v.length !== 9 &&
          !(v.length === 11 && v.startsWith("51"))
        ) {
          Swal.showValidationMessage(
            "Ingresa DNI de 8 dígitos o teléfono de 9 dígitos",
          );
          return false;
        }
        return v;
      },
    });
    if (!isConfirmed) return null;
    return String(value).replace(/\D/g, "");
  };

  /* Fase 1 – captura polling */
  const captureFingerprint = async (): Promise<{
    template: string;
    image?: string;
  } | null> => {
    // La API mantiene el lector disponible durante varios intentos internos.
    // Desde la interfaz solo iniciamos una sesión de lectura por operación.
    const MAX = 1;
    for (let i = 0; i < MAX; i++) {
      if (!scanningRef.current) return null;
      try {
        const r = await fetch("/api/biometric/capture", {
          method: "POST",
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          template?: string;
          image?: string;
        };
        if (j?.ok && j?.template) return { template: j.template, image: j.image };
        await new Promise((res) => setTimeout(res, 300));
      } catch {
        await new Promise((res) => setTimeout(res, 300));
      }
    }
    return null;
  };

  /* Fase 2 – 1:N identify */
  const identifyByTemplate = async (
    template: string,
  ): Promise<IdentifyResult> => {
    const r = await fetch("/api/biometric/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template }),
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok !== true) {
      throw new Error(j?.message || "No se pudo comparar la huella. Comprueba el servicio biométrico.");
    }
    return {
      ok: true,
      match: Boolean(j?.match),
      userId: j?.userId ?? j?.user_id ?? null,
      name: j?.fullName ?? j?.name,
    };
  };

  /* Diálogo compartido de lectura biométrica */
  const showScanDialog = (tipo: "entrada" | "salida" | "deuda" = "entrada") => {
    setFingerprintCapture({ open: true, phase: "capturing", operation: tipo });
  };

  const closeScanDialog = () =>
    setFingerprintCapture((current) => ({ ...current, open: false, phase: "ready", image: undefined }));

  const showCapturedFingerprint = (image?: string) =>
    setFingerprintCapture((current) => ({ ...current, phase: "saving", image }));

  const completeScanDialog = async () => {
    setFingerprintCapture((current) => ({ ...current, phase: "success" }));
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    closeScanDialog();
  };

  const register = async (payload: {
    userId?: string;
    identifier?: string;
    intent?: "checkout";
  }) => {
    const r = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const j = (await r
      .json()
      .catch(() => ({}) as RegisterResult)) as RegisterResult;
    if (!r.ok)
      throw new Error(
        (j as RegisterResult & { message?: string })?.message ||
          "No se pudo registrar la asistencia",
      );
    return j;
  };

  const showCard = async (data: RegisterResult, fallbackName?: string) => {
    const name = (data.fullName || fallbackName || "").trim();
    if (data.type === "rebote" || data.type === "already_open" || data.action === "already_open") {
      await Swal.fire({
        ...swalBase,
        icon: "info",
        title: data.type === "rebote" ? "Registro ya tomado" : "Entrada ya abierta",
        text: name ? `${name} ya tiene una entrada activa.` : "Ya tienes una entrada activa.",
        confirmButtonText: "Cerrar",
      });
      return;
    }
    const isAdminUser = role === "admin";
    const monthlyDebtNum = data.monthlyDebt || 0;
    const dailyDebtNum = data.dailyDebt || 0;
    const totalDebtNum = data.totalDebt || 0;
    const daysLeftNum =
      data.daysLeft === null || data.daysLeft === undefined
        ? undefined
        : Number(data.daysLeft);

    const isCheckout = data.action === "checkout";
    const accent = isCheckout ? W.danger : W.yellow;
    const title = isCheckout
      ? `¡Hasta la próxima${name ? ", " + name : ""}!`
      : `¡Bienvenido${name ? ", " + name : ""}!`;
    const avatar =
      data.avatarUrl ||
      "https://ui-avatars.com/api/?background=FFC21A&color=0A0A0A&name=" +
        encodeURIComponent(name || "W G");

    const html = `
      <div style="display:flex;gap:14px;align-items:center;background:#141414;border:1px solid rgba(255,194,26,0.15);border-radius:12px;padding:16px;margin-top:4px">
        <img src="${avatar}" style="width:64px;height:64px;border-radius:999px;object-fit:cover;border:2px solid ${accent}" alt="avatar"/>
        <div style="text-align:left;flex:1">
          <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:22px;letter-spacing:.04em;color:#fff;line-height:1.1">${name || "Cliente"}</div>
          ${data.plan ? `<div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">📋 Plan: <b style="color:#fff">${data.plan}</b></div>` : ""}
          ${Number.isFinite(daysLeftNum) ? `<div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">📅 <b style="color:#fff">${daysLeftNum}</b> días restantes</div>` : ""}
          ${totalDebtNum > 0 ? `<div style="font-size:12px;color:#E5484D;margin-top:4px">⚠ Deuda: <b>S/. ${totalDebtNum.toFixed(2)}</b></div>` : ""}
          ${isCheckout && Number.isFinite(data.minutesOpen) ? `<div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">⏱ Sesión: ${data.minutesOpen} min</div>` : ""}
        </div>
      </div>`;

    if (isAdminUser) {
      setActivityLog((prev) => [
        {
          id: Date.now().toString(),
          timestamp: new Date(),
          fullName: name,
          action: isCheckout ? "checkout" : "checkin",
          avatarUrl: data.avatarUrl,
          monthlyDebt: monthlyDebtNum,
          dailyDebt: dailyDebtNum,
          totalDebt: totalDebtNum,
          daysLeft: daysLeftNum ?? undefined,
          plan: data.plan,
          profileId: data.profileId,
        },
        ...prev.slice(0, 49),
      ]);
      await refreshActiveGymMembers();
    }

    const result = await Swal.fire({
      ...swalBase,
      icon: "success",
      title: `<span style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:26px;letter-spacing:.04em">${title}</span>`,
      html,
      timer: isAdminUser ? undefined : 2500,
      showConfirmButton: isAdminUser && !isCheckout,
      confirmButtonText: "Agregar Deuda",
      showCancelButton: isAdminUser,
      cancelButtonText: "Cerrar",
    });

    if (isAdminUser && result.isConfirmed && data.profileId) {
      setSelectedClient({
        profileId: data.profileId,
        fullName: data.fullName,
        plan: data.plan,
        daysLeft: daysLeftNum,
        monthlyDebt: monthlyDebtNum,
        dailyDebt: dailyDebtNum,
        totalDebt: totalDebtNum,
      });
      setShowDebtDialog(true);
    }
  };

  /* ── lookup client for debt (no check-in) ── */
  const lookupClientForDebt = async (payload: {
    userId?: string;
    identifier?: string;
  }): Promise<DebtTarget> => {
    const response = await fetch("/api/check-in/client-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.profileId) {
      throw new Error(data?.message || "No se encontró el cliente");
    }
    return {
      userId: data.userId,
      profileId: data.profileId,
      fullName: data.fullName,
      plan: data.plan,
      daysLeft: data.daysLeft !== undefined ? Number(data.daysLeft) : undefined,
      monthlyDebt: Number(data.monthlyDebt || 0),
      dailyDebt: Number(data.dailyDebt || 0),
      totalDebt: Number(data.totalDebt || 0),
    };
  };

  /* ══════════════════ scan flows ══════════════════ */

  const startAutoScan = async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    showScanDialog("entrada");
    try {
      const capture = await captureFingerprint();
      if (!capture || !scanningRef.current) {
        closeScanDialog();
        return;
      }
      showCapturedFingerprint(capture.image);
      const res = await identifyByTemplate(capture.template);
      if (!scanningRef.current) {
        closeScanDialog();
        return;
      }
      if (res.match && res.userId) {
        const data = await register({ userId: res.userId });
        if (data.type === "rebote" || data.type === "already_open" || data.action === "already_open") {
          closeScanDialog();
        } else {
          await completeScanDialog();
        }
        vibrate(200);
        await showCard(data, res.name);
      } else {
        closeScanDialog();
        const identifier = await askIdentifier(
          "No te reconocimos. Registra por DNI o teléfono",
        );
        if (!identifier) return;
        const data = await register({ identifier });
        vibrate(200);
        await showCard(data);
      }
    } catch (error: unknown) {
      closeScanDialog();
      vibrate(60);
      await Swal.fire({
        ...swalBase,
        icon: "error",
        title: "Error al registrar",
        text: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
      scanningRef.current = false;
    }
  };

  const forceCheckout = async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    showScanDialog("salida");
    try {
      const capture = await captureFingerprint();
      if (!capture || !scanningRef.current) {
        closeScanDialog();
        return;
      }
      showCapturedFingerprint(capture.image);
      const res = await identifyByTemplate(capture.template);
      if (!scanningRef.current) {
        closeScanDialog();
        return;
      }
      if (res.match && res.userId) {
        const data = await register({ userId: res.userId, intent: "checkout" });
        await completeScanDialog();
        vibrate(200);
        await showCard(data, res.name);
      } else {
        closeScanDialog();
        const identifier = await askIdentifier(
          "No te reconocimos. Salida por DNI o teléfono",
        );
        if (!identifier) return;
        const data = await register({ identifier, intent: "checkout" });
        vibrate(200);
        await showCard(data);
      }
    } catch (error: unknown) {
      closeScanDialog();
      vibrate(60);
      await Swal.fire({
        ...swalBase,
        icon: "error",
        title: "Error al registrar salida",
        text: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
      scanningRef.current = false;
    }
  };

  /* ── debt with fingerprint-first ── */
  const startDebtScan = async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    showScanDialog("deuda");
    try {
      const capture = await captureFingerprint();
      if (!scanningRef.current) {
        closeScanDialog();
        return;
      }
      if (capture) showCapturedFingerprint(capture.image);
      let target: DebtTarget | null = null;
      if (capture && scanningRef.current) {
        const identified = await identifyByTemplate(capture.template);
        if (!scanningRef.current) {
          closeScanDialog();
          return;
        }
        if (identified.match && identified.userId) {
          target = await lookupClientForDebt({ userId: identified.userId });
        }
      }
      if (!target) {
        closeScanDialog();
        const identifier = await askIdentifier(
          "No te reconocimos. Busca por DNI o teléfono",
        );
        if (!identifier) return;
        target = await lookupClientForDebt({ identifier });
      } else {
        await completeScanDialog();
      }
      setSelectedClient(target);
      setShowDebtDialog(true);
    } catch (error: unknown) {
      closeScanDialog();
      await Swal.fire({
        ...swalBase,
        icon: "error",
        title: "No se pudo agregar deuda",
        text: getErrorMessage(error, "Inténtalo nuevamente."),
      });
    } finally {
      setLoading(false);
      scanningRef.current = false;
    }
  };

  /* ══════════════════ SSE – kiosk listener ══════════════════ */
  useEffect(() => {
    if (!mounted || mode !== "kiosk") return;
    const ev = new EventSource(
      `/api/commands?room=${encodeURIComponent(room)}`,
    );
    ev.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data || "{}");
        if (data.action === "scan") startAutoScan();
        if (data.action === "checkout") forceCheckout();
        if (data.action === "stop") {
          scanningRef.current = false;
          setLoading(false);
          closeScanDialog();
          Swal.close();
        }
      } catch {}
    };
    ev.onerror = () => {};
    return () => ev.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, mode, room]);

  /* ══════════════════ remote – send commands ══════════════════ */
  const sendCommand = async (action: "scan" | "checkout" | "stop") => {
    await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, action }),
    }).catch(() => {});
  };

  /* ══════════════════ debt ══════════════════ */
  const addDebt = async (
    productId: string,
  ) => {
    if (!selectedClient?.profileId) return;
    if (debtSending.current) return;
    if (debtIntent.current && (debtIntent.current.productId !== productId || debtIntent.current.profileId !== selectedClient.profileId)) {
      await Swal.fire({ ...swalBase, icon: "warning", title: "Operación por confirmar", text: "Consulte Caja / Ventas antes de registrar otro producto. Reintente el mismo producto para confirmar la solicitud pendiente." });
      return;
    }
    debtSending.current = true;
    debtIntent.current ??= { key: crypto.randomUUID(), productId, profileId: selectedClient.profileId };
    try {
      const response = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": debtIntent.current.key },
        body: JSON.stringify({
          clientProfileId: selectedClient.profileId,
          productId,
          quantity: 1,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status < 500) debtIntent.current = null;
      if (response.ok) {
        const summary = data?.summary as
          | { monthlyDebt: number; dailyDebt: number; totalDebt: number }
          | undefined;
        if (summary) {
          const applySummary = <T extends { profileId?: string }>(item: T) =>
            item.profileId === selectedClient.profileId
              ? { ...item, ...summary }
              : item;
          setActiveGymMembers((current) => current.map(applySummary));
          setActivityLog((current) => current.map(applySummary));
        }
        await Swal.fire({
          ...swalBase,
          icon: "success",
          title: "Deuda agregada",
          timer: 1500,
          showConfirmButton: false,
        });
        setShowDebtDialog(false);
        setSelectedClient(null);
        await refreshActiveGymMembers();
      } else throw new Error(data?.error || "No se pudo agregar la deuda");
    } catch (error: unknown) {
      await Swal.fire({
        ...swalBase,
        icon: "error",
        title: "Error",
        text: getErrorMessage(error, "No se pudo agregar la deuda"),
      });
    } finally { debtSending.current = false; }
  };

  /* ══════════════════ derived ══════════════════ */
  const isAdmin = role === "admin";
  const displayUrl = mounted
    ? `${window.location.origin}/check-in/display?room=${room}`
    : "";

  /* ══════════════════ shared style objects ══════════════════ */
  const cardDark: React.CSSProperties = {
    background: W.ink,
    border: `1px solid ${W.lineDark}`,
    borderRadius: 14,
  };
  const btn = (
    bg: string,
    fg: string,
    border?: string,
  ): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: bg,
    color: fg,
    border: `1px solid ${border ?? bg}`,
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    padding: "0 18px",
    height: 48,
    transition: "opacity .15s",
    fontFamily: "Inter, system-ui, sans-serif",
    whiteSpace: "nowrap" as const,
    opacity: loading ? 0.55 : 1,
    width: "100%",
  });

  /* ══════════════════ render ══════════════════ */
  return (
    <>
      {/* Wolf Gym fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        .wg-page * { box-sizing: border-box; }
        .wg-btn-primary:hover { background: #FF7A1A !important; border-color: #FF7A1A !important; }
        .wg-btn-danger:hover  { background: #c0363a !important; border-color: #c0363a !important; }
        .wg-btn-ghost:hover   { background: rgba(255,255,255,0.06) !important; }
        .wg-btn-ghost-y:hover { background: rgba(255,194,26,0.08) !important; }
        .wg-log-item:hover    { border-color: rgba(255,194,26,0.35) !important; }
        .wg-control-card { min-width: 0; }
        .wg-control-title {
          display: block;
          max-width: 100%;
          padding-top: 4px;
          font-size: 56px;
          line-height: 1.04;
          overflow-wrap: anywhere;
        }
        @media (max-width: 1200px) {
          .wg-control-title { font-size: 48px; }
        }
        @media (max-width: 640px) {
          .wg-topbar {
            height: auto !important;
            padding: 14px 16px !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
          }
          .wg-topbar-actions {
            width: 100% !important;
            margin-left: 0 !important;
            justify-content: space-between !important;
            flex-wrap: wrap !important;
          }
          .wg-eyebrow-row {
            padding: 18px 20px 0 !important;
          }
          .wg-kiosk-grid {
            grid-template-columns: 1fr !important;
            padding: 14px 16px 20px !important;
          }
          .wg-control-card {
            padding: 24px !important;
          }
          .wg-control-title {
            font-size: 42px;
            line-height: 1.06;
          }
          .wg-action-grid {
            grid-template-columns: 1fr !important;
          }
          .wg-action-grid button {
            min-width: 0 !important;
            white-space: normal !important;
          }
        }
      `}</style>

      <div
        className="wg-page"
        style={{
          minHeight: "100dvh",
          background: W.black,
          color: "#fff",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Top nav ── */}
        <header
          className="wg-topbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            height: 64,
            padding: "0 24px",
            borderBottom: `1px solid ${W.lineDark}`,
            flexShrink: 0,
          }}
        >
          <WolfLogo />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 12,
            }}
          >
            <Badge variant="yellow">Panel local</Badge>
            <Badge variant="neutral">{room}</Badge>
          </div>
          <div
            className="wg-topbar-actions"
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {isAdmin && (
              <span style={{ fontSize: 12, color: W.mutedDark }}>
                {mode === "remote" ? "Control remoto" : "Modo recepción"}
              </span>
            )}
            <Link
              href="/admin/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: W.yellow,
                color: W.black,
                padding: "0 14px",
                height: 36,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              Panel administrativo →
            </Link>
          </div>
        </header>

        {/* ── Eyebrow ── */}
        <div
          className="wg-eyebrow-row"
          style={{
            padding: "18px 24px 0",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>👆</span>
          <Eyebrow>Recepción Wolf Gym</Eyebrow>
        </div>

        {/* ══════ KIOSK MODE ══════ */}
        {mode === "kiosk" ? (
          <div
            className="wg-kiosk-grid"
            style={{
              flex: 1,
              padding: "14px 24px 24px",
              display: "grid",
              gridTemplateColumns: isAdmin ? "1.5fr 1fr" : "1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            {/* ── Main control card ── */}
            <div
              className="wg-control-card"
              style={{
                ...cardDark,
                padding: 32,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* watermark */}
              <div
                style={{
                  position: "absolute",
                  right: -40,
                  bottom: -40,
                  opacity: 0.04,
                  pointerEvents: "none",
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 240,
                  lineHeight: 1,
                  color: W.yellow,
                }}
              >
                W
              </div>

              <Eyebrow style={{ marginBottom: 8, position: "relative" }}>
                Control de acceso
              </Eyebrow>
              <h1
                className="wg-control-title"
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  margin: "0 0 12px",
                  letterSpacing: 0,
                  position: "relative",
                }}
              >
                ENTRADA Y SALIDA
                <br />
                <span style={{ color: W.yellow }}>CON HUELLA.</span>
              </h1>
              <p
                style={{
                  color: W.mutedDark,
                  fontSize: 13,
                  marginBottom: 28,
                  maxWidth: 440,
                  position: "relative",
                  lineHeight: 1.6,
                }}
              >
                Identificación automática por huella. Si no te reconoce, usa tu
                DNI o teléfono. Plan vencido bloquea el acceso.
              </p>

              {/* Buttons 2×2 */}
              <div
                className="wg-action-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  position: "relative",
                }}
              >
                <button
                  className="wg-btn-primary"
                  onClick={startAutoScan}
                  disabled={loading}
                  style={{
                    ...btn(W.yellow, W.black),
                    height: 60,
                    fontSize: 15,
                  }}
                >
                  👆 Marcar Entrada
                </button>
                <button
                  className="wg-btn-danger"
                  onClick={forceCheckout}
                  disabled={loading}
                  style={{ ...btn(W.danger, W.black), height: 60, fontSize: 15 }}
                >
                  🚪 Marcar Salida
                </button>
                <button
                  className="wg-btn-ghost-y"
                  disabled={loading}
                  onClick={startDebtScan}
                  style={{
                    ...btn("transparent", W.yellow, W.lineStrong),
                    height: 42,
                    fontSize: 13,
                  }}
                >
                  💳 Registrar deuda
                </button>
                <button
                  className="wg-btn-ghost-y"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      const identifier = await askIdentifier(
                        "Ingresa tu DNI o teléfono para registrar",
                      );
                      if (!identifier) return;
                      const data = await register({ identifier });
                      vibrate(200);
                      await showCard(data);
                    } catch (error: unknown) {
                      await Swal.fire({
                        ...swalBase,
                        icon: "error",
                        title: "Error",
                        text: getErrorMessage(error),
                      });
                    }
                  }}
                  style={{
                    ...btn("transparent", W.yellow, W.lineStrong),
                    height: 42,
                    fontSize: 13,
                  }}
                >
                  📱 Registrar por DNI/Tel
                </button>
              </div>

              {/* Display link – admin only */}
              {isAdmin && mounted && (
                <div
                  style={{
                    marginTop: 20,
                    padding: "12px 14px",
                    background: W.black,
                    border: `1px solid ${W.lineDark}`,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    position: "relative",
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>🖥</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: W.faintDark,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 2,
                      }}
                    >
                      Pantalla de visualización
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: "rgba(255,255,255,0.7)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayUrl}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(displayUrl);
                    }}
                    style={{
                      ...btn(
                        "transparent",
                        "rgba(255,255,255,0.8)",
                        W.lineStrong,
                      ),
                      minHeight: 40,
                      fontSize: 11,
                      padding: "0 10px",
                      width: "auto",
                    }}
                  >
                    Copiar
                  </button>
                  <button
                    onClick={() => window.open(displayUrl, "_blank")}
                    style={{
                      ...btn(W.yellow, W.black),
                      minHeight: 40,
                      fontSize: 11,
                      padding: "0 10px",
                      width: "auto",
                    }}
                  >
                    Abrir
                  </button>
                </div>
              )}
            </div>

            {/* ── Activity stream (admin only) ── */}
            {isAdmin && (
              <div
                style={{
                  ...cardDark,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  maxHeight: "calc(100vh - 160px)",
                }}
              >
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: `1px solid ${W.lineDark}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <Eyebrow>Actividad reciente</Eyebrow>
                    <h3
                      style={{
                        fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                        fontSize: 22,
                        margin: "4px 0 0",
                        letterSpacing: "0.02em",
                      }}
                    >
                      EN GYM
                      {activeGymMembers.length > 0 && (
                        <span
                          style={{
                            marginLeft: 10,
                            fontSize: 13,
                            background: "rgba(255,194,26,0.14)",
                            border: "1px solid rgba(255,194,26,0.35)",
                            color: W.yellow,
                            borderRadius: 999,
                            padding: "2px 10px",
                            verticalAlign: "middle",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontWeight: 700,
                          }}
                        >
                          {activeGymMembers.length}
                        </span>
                      )}
                    </h3>
                  </div>
                  <button
                    onClick={refreshActiveGymMembers}
                    aria-label="Actualizar miembros activos"
                    title="Actualizar"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: W.yellow,
                      width: 40,
                      height: 40,
                      display: "inline-grid",
                      placeItems: "center",
                      padding: 0,
                    }}
                  >
                    <RefreshCw aria-hidden="true" size={18} />
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                  {gymActivity.length === 0 ? (
                    <div
                      style={{
                        padding: 24,
                        background: W.black,
                        borderRadius: 10,
                        border: `1px dashed rgba(255,194,26,0.2)`,
                        textAlign: "center",
                        color: W.faintDark,
                        fontSize: 13,
                      }}
                    >
                      No hay actividad reciente
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {gymActivity.map((item) => {
                        const isInside = item.status === "Dentro";
                        const isEntry = item.status === "Entrada";
                        const isExit = item.status === "Salida";
                        const hasDebt = item.totalDebt > 0;
                        const minutesIn = isInside
                          ? Math.floor(
                              (Date.now() -
                                (item as ActiveGymMember & { status: string })
                                  .checkInTime) /
                                60000,
                            )
                          : undefined;
                        const accentLeft = isExit ? W.danger : W.yellow;

                        return (
                          <div
                            key={item.id}
                            className="wg-log-item"
                            style={{
                              background: W.black,
                              borderRadius: 10,
                              border: `1px solid ${isInside ? W.lineDark : W.lineDark}`,
                              borderLeft: `3px solid ${accentLeft}`,
                              overflow: "hidden",
                              transition: "border-color .15s",
                            }}
                          >
                            {/* Row 1: name + badge + time */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 12px 6px",
                              }}
                            >
                              <div
                                role="img"
                                aria-label="avatar"
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                  backgroundColor: W.yellow,
                                  backgroundImage: `url("${item.avatarUrl || `https://ui-avatars.com/api/?background=FFC21A&color=0A0A0A&name=${encodeURIComponent(item.fullName || "W")}`}")`,
                                  backgroundPosition: "center",
                                  backgroundSize: "cover",
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 13,
                                    color: "#fff",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {item.fullName}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginTop: 3,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {isInside && (
                                    <Badge variant="inside">🟢 Dentro</Badge>
                                  )}
                                  {isEntry && (
                                    <Badge variant="success">↗ Entrada</Badge>
                                  )}
                                  {isExit && (
                                    <Badge variant="danger">↙ Salida</Badge>
                                  )}
                                  {minutesIn !== undefined && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: W.faintDark,
                                      }}
                                    >
                                      {minutesIn}min
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: W.faintDark,
                                      marginLeft: "auto",
                                    }}
                                  >
                                    {item.timestamp.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Row 2: 2×2 data grid */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 1,
                                margin: "0 12px",
                              }}
                            >
                              {[
                                { label: "Plan", value: item.plan ?? "—" },
                                {
                                  label: "Días restantes",
                                  value:
                                    item.daysLeft !== undefined
                                      ? `${item.daysLeft}d`
                                      : "—",
                                },
                                {
                                  label: "Deuda mensual",
                                  value: `S/. ${item.monthlyDebt.toFixed(2)}`,
                                  red: item.monthlyDebt > 0,
                                },
                                {
                                  label: "Deuda diaria",
                                  value: `S/. ${item.dailyDebt.toFixed(2)}`,
                                  red: item.dailyDebt > 0,
                                },
                              ].map(({ label, value, red }) => (
                                <div
                                  key={label}
                                  style={{
                                    padding: "5px 8px",
                                    background: "rgba(255,255,255,0.02)",
                                    borderRadius: 6,
                                    margin: "1px 0",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      color: W.faintDark,
                                      letterSpacing: "0.08em",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: red ? W.danger : "#fff",
                                      marginTop: 1,
                                    }}
                                  >
                                    {value}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Row 3: total debt + action */}
                            <div
                              style={{
                                margin: "6px 12px 10px",
                                padding: "6px 10px",
                                borderRadius: 8,
                                background: hasDebt
                                  ? "rgba(229,72,77,0.12)"
                                  : "rgba(46,189,117,0.08)",
                                border: `1px solid ${hasDebt ? "rgba(229,72,77,0.3)" : "rgba(46,189,117,0.25)"}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: W.faintDark,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.07em",
                                  }}
                                >
                                  Total deuda
                                </span>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: hasDebt ? W.danger : W.success,
                                  }}
                                >
                                  {hasDebt
                                    ? `S/. ${item.totalDebt.toFixed(2)}`
                                    : "Sin deuda ✓"}
                                </div>
                              </div>
                              {item.profileId && (
                                <button
                                  onClick={() => {
                                    setSelectedClient({
                                      profileId: item.profileId!,
                                      userId: item.userId,
                                      fullName: item.fullName,
                                      plan: item.plan,
                                      daysLeft: item.daysLeft,
                                      monthlyDebt: item.monthlyDebt,
                                      dailyDebt: item.dailyDebt,
                                      totalDebt: item.totalDebt,
                                    });
                                    setShowDebtDialog(true);
                                  }}
                                  style={{
                                    background: "transparent",
                                    border: `1px solid ${W.lineStrong}`,
                                    borderRadius: 7,
                                    color: W.yellow,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "4px 10px",
                                    cursor: "pointer",
                                    fontFamily: "Inter, system-ui, sans-serif",
                                  }}
                                >
                                  + Deuda
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ══════ REMOTE MODE ══════ */
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              style={{ ...cardDark, padding: 32, width: "100%", maxWidth: 400 }}
            >
              <Eyebrow style={{ marginBottom: 8 }}>Control remoto</Eyebrow>
              <h2
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: 32,
                  margin: "0 0 24px",
                  letterSpacing: "0.02em",
                }}
              >
                SALA{" "}
                <span style={{ color: W.yellow }}>{room.toUpperCase()}</span>
              </h2>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <button
                  className="wg-btn-primary"
                  onClick={() => sendCommand("scan")}
                  style={{
                    ...btn(W.yellow, W.black),
                    height: 54,
                    fontSize: 15,
                  }}
                >
                  👆 Escanear / Marcar entrada
                </button>
                <button
                  className="wg-btn-danger"
                  onClick={() => sendCommand("checkout")}
                  style={{ ...btn(W.danger, W.black), height: 54, fontSize: 15 }}
                >
                  🚪 Marcar salida
                </button>
                <button
                  className="wg-btn-ghost"
                  onClick={() => sendCommand("stop")}
                  style={{
                    ...btn(
                      "transparent",
                      "rgba(255,255,255,0.8)",
                      W.lineStrong,
                    ),
                    height: 42,
                    fontSize: 13,
                  }}
                >
                  ✋ Detener
                </button>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: W.faintDark,
                  marginTop: 20,
                  lineHeight: 1.7,
                }}
              >
                Panel:{" "}
                <code style={{ color: W.yellow }}>/check-in?room={room}</code>
                <br />
                Control:{" "}
                <code style={{ color: W.yellow }}>
                  /check-in?remote=1&room={room}
                </code>
              </p>
            </div>
          </div>
        )}

        {/* ══════ Debt overlay ══════ */}
        {showDebtDialog && selectedClient && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.78)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                ...cardDark,
                padding: 28,
                maxWidth: 480,
                width: "calc(100% - 32px)",
              }}
            >
              <Eyebrow style={{ marginBottom: 8 }}>Agregar deuda</Eyebrow>
              <h3
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: 24,
                  margin: "0 0 4px",
                  letterSpacing: "0.02em",
                }}
              >
                {selectedClient.fullName ?? "Cliente"}
              </h3>

              {/* Client snapshot */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                  marginBottom: 16,
                  padding: "10px 12px",
                  background: W.black,
                  borderRadius: 10,
                  border: `1px solid ${W.lineDark}`,
                }}
              >
                {[
                  { label: "Plan", value: selectedClient.plan ?? "—" },
                  {
                    label: "Días",
                    value:
                      selectedClient.daysLeft !== undefined
                        ? `${selectedClient.daysLeft}d`
                        : "—",
                  },
                  {
                    label: "Deuda",
                    value: `S/. ${selectedClient.totalDebt.toFixed(2)}`,
                    red: selectedClient.totalDebt > 0,
                  },
                ].map(({ label, value, red }) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 9,
                        color: W.faintDark,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: red ? W.danger : "#fff",
                        marginTop: 2,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {debtCatalog.map(product => (
                  <button
                    key={product.item_id}
                    className="wg-btn-ghost"
                    disabled={product.track_stock && product.item_stock <= 0}
                    onClick={() => addDebt(product.item_id)}
                    style={{
                      ...btn(
                        "transparent",
                        "rgba(255,255,255,0.85)",
                        W.lineStrong,
                      ),
                      height: 40,
                      fontSize: 12,
                      padding: "0 10px",
                    }}
                  >
                    {product.item_name} · S/ {(Math.round(product.item_price * (1 - (product.item_discount ?? 0) / 100) * 100) / 100).toFixed(2)}
                  </button>
                ))}
                <button
                  className="wg-btn-ghost-y"
                  onClick={async () => {
                    window.location.assign("/admin/products");
                  }}
                  style={{
                    ...btn("transparent", W.yellow, W.lineStrong),
                    height: 40,
                    fontSize: 12,
                    gridColumn: "span 2",
                  }}
                >
                  Administrar productos / servicios
                </button>
              </div>
              <button
                className="wg-btn-ghost"
                onClick={() => {
                  setShowDebtDialog(false);
                  setSelectedClient(null);
                }}
                style={{
                  ...btn("transparent", "rgba(255,255,255,0.7)", W.lineStrong),
                  height: 40,
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        <FingerprintCaptureDialog
          open={fingerprintCapture.open}
          phase={fingerprintCapture.phase}
          image={fingerprintCapture.image}
          operation={fingerprintCapture.operation}
          onCancel={() => {
            scanningRef.current = false;
            setLoading(false);
            closeScanDialog();
          }}
        />
      </div>
    </>
  );
}
