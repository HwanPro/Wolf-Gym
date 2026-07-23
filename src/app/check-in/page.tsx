"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";

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
  faintDark: "rgba(255,255,255,0.40)",
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
type ActiveGymMember = {
  profileId: string;
  userId?: string;
  fullName: string;
  plan?: string;
  daysLeft?: number;
  monthlyDebt: number;
  dailyDebt: number;
  totalDebt: number;
  checkInTime: number;
  avatarUrl?: string;
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
type AttendanceRow = {
  checkOutTime?: string | null;
  checkInTime: string;
  profileId?: string;
  userId?: string;
  fullName?: string;
  plan?: string;
  daysLeft?: number | string;
  monthlyDebt?: number | string;
  dailyDebt?: number | string;
  totalDebt?: number | string;
  avatarUrl?: string;
  profile?: {
    id?: string;
    fullName?: string;
    plan?: string;
    image?: string;
  };
  user?: {
    id?: string;
    name?: string;
    image?: string;
  };
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
  const [selectedClient, setSelectedClient] = useState<DebtTarget | null>(null);

  const role = session?.user?.role;

  /* ── persist activity log ── */
  useEffect(() => {
    if (mounted && role === "admin") {
      const today = new Date().toDateString();
      const saved = localStorage.getItem(`activityLog_${today}`);
      if (saved) {
        try {
          setActivityLog(
            JSON.parse(saved).map(
              (item: ActivityLog & { timestamp: string }) => ({
                ...item,
                timestamp: new Date(item.timestamp),
              }),
            ),
          );
        } catch {}
      }
    }
  }, [mounted, role]);

  useEffect(() => {
    if (mounted && role === "admin" && activityLog.length > 0) {
      const today = new Date().toDateString();
      localStorage.setItem(`activityLog_${today}`, JSON.stringify(activityLog));
    }
  }, [activityLog, mounted, role]);

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
      const rows = (await response.json()) as AttendanceRow[];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const active: ActiveGymMember[] = rows
        .filter(
          (row) => !row.checkOutTime && new Date(row.checkInTime) >= todayStart,
        )
        .map((row) => ({
          profileId: row.profileId ?? row.profile?.id ?? "",
          userId: row.userId ?? row.user?.id,
          fullName:
            row.fullName ??
            row.profile?.fullName ??
            row.user?.name ??
            "Cliente",
          plan: row.plan ?? row.profile?.plan,
          daysLeft:
            row.daysLeft !== undefined ? Number(row.daysLeft) : undefined,
          monthlyDebt: Number(row.monthlyDebt ?? 0),
          dailyDebt: Number(row.dailyDebt ?? 0),
          totalDebt: Number(
            row.totalDebt ??
              Number(row.monthlyDebt ?? 0) + Number(row.dailyDebt ?? 0),
          ),
          checkInTime: new Date(row.checkInTime).getTime(),
          avatarUrl: row.avatarUrl ?? row.profile?.image ?? row.user?.image,
        }))
        .sort(
          (a: ActiveGymMember, b: ActiveGymMember) =>
            b.checkInTime - a.checkInTime,
        );
      setActiveGymMembers(active);
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
  const captureFingerprint = async (): Promise<string | null> => {
    const MAX = 12;
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
        };
        if (j?.ok && j?.template) return j.template;
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
    try {
      const r = await fetch("/api/biometric/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      return {
        ok: r.ok,
        match: Boolean(j?.match),
        userId: j?.userId ?? j?.user_id ?? null,
        name: j?.fullName ?? j?.name,
      };
    } catch {
      return { ok: false, match: false, userId: null };
    }
  };

  /* Scan dialog – Wolf Gym styled */
  const showScanDialog = (tipo: "entrada" | "salida" | "deuda" = "entrada") => {
    const accent = tipo === "salida" ? W.danger : W.yellow;
    const label =
      tipo === "entrada"
        ? "MARCANDO ENTRADA"
        : tipo === "salida"
          ? "MARCANDO SALIDA"
          : "BUSCANDO CLIENTE PARA DEUDA";
    Swal.fire({
      ...swalBase,
      title: `<span style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:28px;letter-spacing:.04em">${label}</span>`,
      html: `
        <div style="text-align:center;padding:8px 0 4px">
          <div style="position:relative;display:inline-block;margin:8px 0 20px">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
              width:80px;height:80px;border:2px solid ${accent};border-radius:50%;
              animation:wgP 1.8s infinite;"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
              width:80px;height:80px;border:2px solid ${accent};border-radius:50%;
              animation:wgP 1.8s .9s infinite;"></div>
            <div style="font-size:44px;position:relative;z-index:10;animation:wgB 1.5s infinite">👆</div>
          </div>
          <p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,0.85)">
            Coloca tu dedo en el lector <b style="color:${accent}">ZK9500</b>
          </p>
          <small style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:.06em;text-transform:uppercase">
            Presiona firmemente y mantén quieto
          </small>
        </div>
        <style>
          @keyframes wgP{0%{transform:translate(-50%,-50%) scale(.8);opacity:1}
            100%{transform:translate(-50%,-50%) scale(2);opacity:0}}
          @keyframes wgB{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}60%{transform:translateY(-5px)}}
        </style>`,
      allowOutsideClick: true,
      showConfirmButton: true,
      confirmButtonText: "✋ Detener",
      confirmButtonColor: W.graph,
      showCancelButton: false,
      didOpen: () => {
        document
          .querySelector(".swal2-confirm")
          ?.addEventListener("click", () => {
            scanningRef.current = false;
            Swal.close();
          });
      },
    });
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
      const template = await captureFingerprint();
      Swal.close();
      if (!template || !scanningRef.current) return;
      const res = await identifyByTemplate(template);
      if (res.match && res.userId) {
        const data = await register({ userId: res.userId });
        vibrate(200);
        await showCard(data, res.name);
      } else {
        const identifier = await askIdentifier(
          "No te reconocimos. Registra por DNI o teléfono",
        );
        if (!identifier) return;
        const data = await register({ identifier });
        vibrate(200);
        await showCard(data);
      }
    } catch (error: unknown) {
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
      const template = await captureFingerprint();
      Swal.close();
      if (!template || !scanningRef.current) return;
      const res = await identifyByTemplate(template);
      if (res.match && res.userId) {
        const data = await register({ userId: res.userId, intent: "checkout" });
        vibrate(200);
        await showCard(data, res.name);
      } else {
        const identifier = await askIdentifier(
          "No te reconocimos. Salida por DNI o teléfono",
        );
        if (!identifier) return;
        const data = await register({ identifier, intent: "checkout" });
        vibrate(200);
        await showCard(data);
      }
    } catch (error: unknown) {
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
      const template = await captureFingerprint();
      Swal.close();
      let target: DebtTarget | null = null;
      if (template && scanningRef.current) {
        const identified = await identifyByTemplate(template);
        if (identified.match && identified.userId) {
          target = await lookupClientForDebt({ userId: identified.userId });
        }
      }
      if (!target) {
        const identifier = await askIdentifier(
          "No te reconocimos. Busca por DNI o teléfono",
        );
        if (!identifier) return;
        target = await lookupClientForDebt({ identifier });
      }
      setSelectedClient(target);
      setShowDebtDialog(true);
    } catch (error: unknown) {
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
    productType: string,
    customAmount?: number,
    customName?: string,
  ) => {
    if (!selectedClient?.profileId) return;
    try {
      const response = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientProfileId: selectedClient.profileId,
          productType,
          quantity: 1,
          customAmount,
          customName,
        }),
      });
      if (response.ok) {
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
      } else throw new Error();
    } catch {
      await Swal.fire({
        ...swalBase,
        icon: "error",
        title: "Error",
        text: "No se pudo agregar la deuda",
      });
    }
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
                {mode === "remote" ? "Control remoto" : "Modo kiosk"}
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
              Dashboard →
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
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: "clamp(40px, 4.5vw, 62px)",
                  lineHeight: 0.95,
                  margin: "0 0 12px",
                  letterSpacing: "0.02em",
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
                  style={{ ...btn(W.danger, "#fff"), height: 60, fontSize: 15 }}
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
                  style={{ ...btn(W.danger, "#fff"), height: 54, fontSize: 15 }}
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
                {[
                  { label: "Agua S/. 1.50", type: "WATER_1_5" },
                  { label: "Agua S/. 2.50", type: "WATER_2_5" },
                  { label: "Agua S/. 3.50", type: "WATER_3_5" },
                  { label: "Proteína S/. 5", type: "PROTEIN_5" },
                  { label: "Pre S/. 3", type: "PRE_WORKOUT_3" },
                  { label: "Pre S/. 5", type: "PRE_WORKOUT_5" },
                  { label: "Pre S/. 10", type: "PRE_WORKOUT_10" },
                ].map(({ label, type }) => (
                  <button
                    key={type}
                    className="wg-btn-ghost"
                    onClick={() => addDebt(type)}
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
                    {label}
                  </button>
                ))}
                <button
                  className="wg-btn-ghost-y"
                  onClick={async () => {
                    const { value: customData } = await Swal.fire({
                      ...swalBase,
                      title: "Producto personalizado",
                      html: `
                        <input id="customName" class="swal2-input" placeholder="Nombre del producto">
                        <input id="customAmount" class="swal2-input" type="number" step="0.01" placeholder="Precio">`,
                      focusConfirm: false,
                      preConfirm: () => {
                        const name = (
                          document.getElementById(
                            "customName",
                          ) as HTMLInputElement
                        )?.value;
                        const amount = parseFloat(
                          (
                            document.getElementById(
                              "customAmount",
                            ) as HTMLInputElement
                          )?.value || "0",
                        );
                        if (!name || amount <= 0) {
                          Swal.showValidationMessage(
                            "Ingresa nombre y precio válidos",
                          );
                          return false;
                        }
                        return { name, amount };
                      },
                    });
                    if (customData)
                      addDebt("CUSTOM", customData.amount, customData.name);
                  }}
                  style={{
                    ...btn("transparent", W.yellow, W.lineStrong),
                    height: 40,
                    fontSize: 12,
                    gridColumn: "span 2",
                  }}
                >
                  ✨ Producto personalizado
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
      </div>
    </>
  );
}
