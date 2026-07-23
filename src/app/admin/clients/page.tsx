// src/app/admin/clients/page.tsx
"use client";

import ConfirmDialog from "@/ui/components/ConfirmDialog";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Button } from "@/ui/button";

type ClientResponse = {
  tempPassword?: string;
  clientProfile?: {
    user_id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/ui/table";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/ui/dialog";
import {
  AddClientDialog,
  DebtManagement,
  EditClientDialog,
} from "@/features/clients";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  Fingerprint,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

type BiometricResponse = {
  ok: boolean;
  message?: string;
  template?: string;
  image?: string;
  hasFingerprint?: boolean;
  match?: boolean;
  score?: number;
  threshold?: number;
};

interface SwalBase {
  background: string;
  color: string;
  confirmButtonColor: string;
  customClass: {
    confirmButton: string;
    cancelButton: string;
  };
}

interface Client {
  id: string;
  userId: string;
  userName: string;
  firstName: string;
  lastName: string;
  plan: string;
  membershipStart: string;
  membershipEnd: string;
  phone: string;
  emergencyPhone: string;
  documentNumber: string;
  prodfile_adress: string;
  profile_social: string;
  hasPaid: boolean;
  password?: string;
  hasFingerprint?: boolean;
  createdAt?: string;
  attendanceDays: number;
  attendanceChannels: Record<string, number>;
}

interface ApiClient {
  profile_id: string;
  user_id: string;
  user?: {
    id?: string;
    role?: string;
    username?: string;
    createdAt?: string | Date;
    fingerprints?: Array<{ id: string }>;
    attendances?: Array<{ checkInTime: string | Date; channel: string }>;
  };
  profile_username?: string;
  profile_first_name?: string;
  profile_last_name?: string;
  profile_plan?: string;
  profile_start_date?: string;
  profile_end_date?: string;
  profile_phone?: string;
  profile_emergency_phone?: string;
  profile_address?: string;
  profile_social?: string;
  documentNumber?: string;
}

// Wolf design tokens
const W = {
  black: "#0A0A0A",
  ink: "#141414",
  graph: "#1C1C1C",
  yellow: "#FFC21A",
  orange: "#FF7A1A",
  danger: "#E5484D",
  success: "#2EBD75",
  line: "rgba(255,255,255,0.10)",
  lineStrong: "rgba(255,255,255,0.18)",
  muted: "rgba(255,255,255,0.60)",
  faint: "rgba(255,255,255,0.40)",
  font: "'Inter', system-ui, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: W.ink,
  border: `1px solid ${W.line}`,
  borderRadius: 14,
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: W.faint,
  borderBottom: `1px solid ${W.line}`,
  background: W.ink,
  fontFamily: W.font,
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: W.muted,
  borderBottom: `1px solid rgba(255,194,26,0.07)`,
  fontFamily: W.font,
};

export default function ClientsPage() {
  const { data: clientsData = [], mutate } = useSWR<Client[]>(
    "/api/clients",
    async (url) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar clientes");
      const data: ApiClient[] = await res.json();
      return data
        .filter((client) => client?.user?.role !== "admin")
        .map((c: ApiClient) => {
          const attendances = c.user?.attendances || [];
          const attendanceDays = new Set(
            attendances.map((attendance) =>
              new Date(attendance.checkInTime).toISOString().slice(0, 10),
            ),
          ).size;
          const attendanceChannels = attendances.reduce<Record<string, number>>(
            (summary, attendance) => {
              const channel = attendance.channel || "unknown";
              summary[channel] = (summary[channel] || 0) + 1;
              return summary;
            },
            {},
          );

          return {
            id: c.profile_id,
            userId: c.user_id,
            userName: c.user?.username || c.profile_username || "",
            firstName: c.profile_first_name || "Sin nombre",
            lastName: c.profile_last_name || "Sin apellido",
            plan: c.profile_plan || "Sin plan",
            membershipStart: c.profile_start_date
              ? new Date(c.profile_start_date).toISOString().split("T")[0]
              : "",
            membershipEnd: c.profile_end_date
              ? new Date(c.profile_end_date).toISOString().split("T")[0]
              : "",
            phone: c.profile_phone || "",
            emergencyPhone: c.profile_emergency_phone || "",
            documentNumber: c.documentNumber || "",
            prodfile_adress: c.profile_address || "",
            profile_social: c.profile_social || "",
            hasPaid: false,
            createdAt: c.user?.createdAt
              ? new Date(c.user.createdAt).toISOString().split("T")[0]
              : "",
            hasFingerprint: Boolean(c.user?.fingerprints?.length),
            attendanceDays,
            attendanceChannels,
          };
        });
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const deleteFingerprint = async (userId: string) => {
    if (!userId) {
      toast.error("Este cliente no tiene userId válido.");
      return;
    }
    const confirm = await Swal.fire({
      ...swalBase,
      title: "Eliminar huella",
      text: "¿Seguro que deseas eliminar la huella de este usuario?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      const res = await fetch(`/api/biometric/delete/${userId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false)
        throw new Error(data?.message || "No se pudo eliminar la huella");
      setFpStatus((s) => ({ ...s, [userId]: false }));
      toast.success("Huella eliminada");
    } catch (err) {
      console.error("Eliminar huella:", err);
      toast.error(
        err instanceof Error ? err.message : "Error eliminando huella",
      );
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  };

  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "expired" | "noDate"
  >("all");
  const [showConfirm, setShowConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [fpStatus, setFpStatus] = useState<Record<string, boolean>>({});
  const [showDebtDialog, setShowDebtDialog] = useState(false);
  const [selectedClientForDebt, setSelectedClientForDebt] = useState<{
    id: string;
    name: string;
    profileId: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const clients = clientsData;
  const totalClients = clients.length;
  const activePlans = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return clients.filter((client) => {
      if (!client.membershipEnd) return false;
      return new Date(client.membershipEnd).getTime() >= today.getTime();
    }).length;
  }, [clients]);
  const fingerprintCount = useMemo(
    () =>
      clients.filter(
        (client) => client.hasFingerprint || fpStatus[client.userId],
      ).length,
    [clients, fpStatus],
  );
  type SortKey =
    | "firstName"
    | "lastName"
    | "plan"
    | "membershipStart"
    | "membershipEnd"
    | "createdAt";
  const [sortBy, setSortBy] = useState<SortKey>("firstName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  };

  const cmp = useMemo(
    () => (a: Client, b: Client, key: SortKey) => {
      const va = a[key] ?? "";
      const vb = b[key] ?? "";
      if (
        key === "membershipStart" ||
        key === "membershipEnd" ||
        key === "createdAt"
      ) {
        const da = va ? new Date(va).getTime() : 0;
        const db = vb ? new Date(vb).getTime() : 0;
        return da - db;
      }
      return String(va).localeCompare(String(vb), "es", {
        sensitivity: "base",
      });
    },
    [],
  );

  const getMembershipDays = (membershipEnd: string) => {
    if (!membershipEnd)
      return {
        label: "Sin fecha",
        style: {
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.4)",
          border: "1px solid rgba(255,255,255,0.1)",
        },
      };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(`${membershipEnd}T00:00:00`);
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < 0) {
      const days = Math.abs(diffDays);
      return {
        label: `Venció hace ${days} ${days === 1 ? "día" : "días"}`,
        style: {
          background: "rgba(229,72,77,0.12)",
          color: "#E5484D",
          border: "1px solid rgba(229,72,77,0.35)",
        },
      };
    }
    if (diffDays === 0)
      return {
        label: "Vence hoy",
        style: {
          background: "rgba(255,122,26,0.12)",
          color: "#FF7A1A",
          border: "1px solid rgba(255,122,26,0.35)",
        },
      };
    return {
      label: `${diffDays} ${diffDays === 1 ? "día" : "días"}`,
      style:
        diffDays <= 7
          ? {
              background: "rgba(255,122,26,0.12)",
              color: "#FF7A1A",
              border: "1px solid rgba(255,122,26,0.35)",
            }
          : {
              background: "rgba(46,189,117,0.12)",
              color: "#2EBD75",
              border: "1px solid rgba(46,189,117,0.35)",
            },
    };
  };

  const getClientStatus = (
    membershipEnd: string,
  ): "active" | "expired" | "noDate" => {
    if (!membershipEnd) return "noDate";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(`${membershipEnd}T00:00:00`);
    return end.getTime() >= today.getTime() ? "active" : "expired";
  };

  interface NewClientData {
    firstName: string;
    lastName: string;
    username: string;
    phoneNumber: string;
    profile: {
      plan: string;
      startDate: string;
      endDate: string;
      emergencyPhone: string;
      address: string;
      social: string;
      documentNumber: string;
      debt: number;
    };
  }

  const [pendingCredentials, setPendingCredentials] = useState<
    Array<{
      username: string;
      password: string;
      phone: string;
      message?: string;
      whatsappUrl?: string | null;
    }>
  >([]);

  const persistPendingCredentials = (
    updater: Array<{
      username: string;
      password: string;
      phone: string;
      message?: string;
      whatsappUrl?: string | null;
    }>,
  ) => {
    localStorage.setItem("pendingCredentials", JSON.stringify(updater));
    setPendingCredentials(updater);
  };

  const swalBase: SwalBase = useMemo(
    () => ({
      background: "#ffffff",
      color: "#141414",
      confirmButtonColor: "#facc15",
      customClass: {
        confirmButton: "swal-confirm-black",
        cancelButton: "swal-cancel-contrast",
      },
    }),
    [],
  );

  useEffect(() => {
    const stored = localStorage.getItem("pendingCredentials");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed))
          setPendingCredentials(parsed.filter(Boolean));
      } catch (error) {
        console.error("Error al parsear pendingCredentials:", error);
      }
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pendingCredentials") {
        const stored = localStorage.getItem("pendingCredentials");
        setPendingCredentials(stored ? JSON.parse(stored) : []);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (!clients || clients.length === 0) return;
    const q = searchQuery.trim().toLowerCase();
    const byStatus =
      statusFilter === "all"
        ? [...clients]
        : clients.filter(
            (client) => getClientStatus(client.membershipEnd) === statusFilter,
          );
    const base = q
      ? byStatus.filter((c) =>
          (
            `${c.firstName || ""} ${c.lastName || ""} ${c.userName || ""} ${c.phone || ""}` +
            ` ${c.documentNumber || ""}`
          )
            .toLowerCase()
            .includes(q),
        )
      : byStatus;
    base.sort((a, b) => {
      const r = cmp(a, b, sortBy);
      return sortDir === "asc" ? r : -r;
    });
    setFilteredClients(base);
  }, [searchQuery, clients, statusFilter, sortBy, sortDir, cmp]);

  useEffect(() => {
    if (!clients.length) return;
    setFpStatus(
      Object.fromEntries(
        clients.map((client) => [
          client.userId,
          Boolean(client.hasFingerprint),
        ]),
      ),
    );
  }, [clients]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAddClient = useMemo(
    () =>
      async (newClient: NewClientData): Promise<ClientResponse> => {
        try {
          const response = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(newClient),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al guardar el cliente");
          }
          const responseData = await response.json();
          await mutate();
          toast.success("Cliente registrado exitosamente");
          return responseData as ClientResponse;
        } catch (error) {
          console.error("Error al agregar cliente:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Error al guardar el cliente",
          );
          throw error;
        }
      },
    [mutate],
  );

  const sendCredentials = async (client: Client) => {
    try {
      setBusy((b) => ({ ...b, [client.id]: true }));
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "credentials" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok)
        throw new Error(
          data?.error || "No se pudieron generar las credenciales",
        );
      const cred = {
        username: String(data.username || client.userName),
        password: String(data.password || ""),
        phone: String(data.phone || client.phone || ""),
        message: String(data.message || ""),
        whatsappUrl: data.whatsappUrl ?? null,
      };
      persistPendingCredentials([cred, ...pendingCredentials]);
      toast.success("Credenciales generadas");
      if (cred.whatsappUrl) window.open(cred.whatsappUrl, "_blank");
    } catch (error) {
      console.error("Enviar credenciales:", error);
      toast.error(
        error instanceof Error ? error.message : "Error generando credenciales",
      );
    } finally {
      setBusy((b) => ({ ...b, [client.id]: false }));
    }
  };

  const captureOnce = async (): Promise<{
    template: string;
    image?: string;
  }> => {
    try {
      const response = await fetch("/api/biometric/capture", {
        method: "POST",
      });
      const data: BiometricResponse = await response
        .json()
        .catch(() => ({ ok: false }) as BiometricResponse);
      if (!response.ok || !data?.ok || !data?.template)
        throw new Error(data?.message || "No se pudo capturar la huella");
      if (typeof data.template !== "string")
        throw new Error("Formato de plantilla de huella inválido");
      return { template: data.template, image: data.image };
    } catch (error) {
      console.error("Error en captura de huella:", error);
      throw error instanceof Error
        ? error
        : new Error("Error desconocido al capturar huella");
    }
  };

  interface RegisterFingerprintResponse {
    ok: boolean;
    message?: string;
    template?: string;
  }

  const registerFingerprint = async (userId: string) => {
    if (!userId) {
      toast.error(
        "Este cliente no tiene userId válido. Actualiza la lista o recarga la página.",
      );
      return;
    }
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      const st = await fetch(`/api/biometric/status/${userId}`, {
        cache: "no-store",
      });
      const sj = await st.json().catch(() => ({ hasFingerprint: false }));
      if (sj?.hasFingerprint) {
        const ask = await Swal.fire({
          ...swalBase,
          title: "Reemplazar huella",
          text: "Este usuario ya tiene huella. ¿Deseas reemplazarla?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Sí, reemplazar",
          cancelButtonText: "Cancelar",
        });
        if (!ask.isConfirmed) return;
      }
      await Swal.fire({
        ...swalBase,
        title: "Coloca tu dedo",
        text: "Manténlo firme hasta que termine la captura",
        icon: "info",
        timer: 2200,
        showConfirmButton: false,
        allowOutsideClick: false,
      });
      Swal.fire({
        ...swalBase,
        title: "Capturando huella...",
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
      let template: string;
      let image: string | undefined;
      try {
        const capture = await captureOnce();
        template = capture.template;
        image = capture.image;
        await Swal.fire({
          ...swalBase,
          title: "✓ Huella capturada correctamente",
          html: image
            ? `<img src="data:image/bmp;base64,${image}" style="max-width:250px; margin:10px auto; display:block; border:2px solid #22c55e; border-radius:8px;" alt="Huella capturada"/>`
            : undefined,
          text: !image ? "Guardando la huella..." : "",
          icon: "success",
          timer: image ? 1600 : 900,
          showConfirmButton: false,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "No se pudo capturar la huella";
        await Swal.fire({
          ...swalBase,
          title: "❌ Error al capturar huella",
          text: errorMessage,
          icon: "error" as const,
        });
        return;
      }
      Swal.fire({
        ...swalBase,
        title: "Guardando huella…",
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
      const res = await fetch(`/api/biometric/register/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const jr: RegisterFingerprintResponse = await res
        .json()
        .catch(() => ({ ok: false }));
      if (!res.ok || !jr?.ok) {
        return Swal.fire({
          ...swalBase,
          title: "❌ Error al registrar huella",
          text:
            jr?.message ||
            "No se pudo completar el registro. Por favor, inténtalo nuevamente.",
          icon: "error",
        });
      }
      setFpStatus((s) => ({ ...s, [userId]: true }));
      return Swal.fire({
        ...swalBase,
        title: "✅ " + (jr?.message || "Huella registrada exitosamente"),
        text: "El cliente puede ahora usar su huella para registrar asistencia",
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error desconocido al procesar la huella";
      await Swal.fire({
        ...swalBase,
        title: "❌ Error al procesar huella",
        text: errorMessage,
        icon: "error" as const,
      });
      return;
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  };

  const verifyFingerprint = async (userId: string) => {
    if (!userId) {
      toast.error("Este cliente no tiene userId válido.");
      return;
    }
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      Swal.fire({
        ...swalBase,
        title: "🔍 Verificando Huella",
        html: `<div class="fingerprint-scanner"><div class="scanner-animation"><div class="pulse-ring"></div><div class="pulse-ring-2"></div><div class="fingerprint-icon">👆</div></div><div class="scanner-text"><p style="margin: 15px 0 5px 0; font-size: 16px; color: #333;">Coloca tu dedo para verificar</p><small style="opacity: 0.7; font-size: 13px;">Presiona firmemente y mantén quieto</small></div></div><style>.fingerprint-scanner { text-align: center; padding: 10px; }.scanner-animation { position: relative; display: inline-block; margin: 10px 0 20px 0; }.pulse-ring, .pulse-ring-2 {position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);width: 80px; height: 80px; border: 3px solid #007bff; border-radius: 50%;animation: pulse 2s infinite;}.pulse-ring-2 { animation-delay: 1s; border-color: #28a745; }.fingerprint-icon { font-size: 40px; z-index: 10; position: relative; animation: bounce 1.5s infinite; }@keyframes pulse {0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }}@keyframes bounce {0%, 20%, 50%, 80%, 100% { transform: translateY(0); }40% { transform: translateY(-10px); }60% { transform: translateY(-5px); }}@keyframes spin {0% { transform: rotate(0deg); }100% { transform: rotate(360deg); }}.spinner { display: inline-block; animation: spin 1s linear infinite; margin-right: 8px; }</style>`,
        allowOutsideClick: false,
        showConfirmButton: false,
        customClass: { popup: "fingerprint-popup" },
      });
      setTimeout(() => {
        const textElement = document.querySelector(
          ".scanner-text p",
        ) as HTMLElement;
        const iconElement = document.querySelector(
          ".fingerprint-icon",
        ) as HTMLElement;
        if (textElement && iconElement) {
          textElement.innerHTML =
            '<span class="spinner">🔄</span> Capturando...';
          textElement.style.color = "#007bff";
          iconElement.innerHTML = "🔄";
          iconElement.style.animation = "spin 1s linear infinite";
        }
      }, 500);
      const { template } = await captureOnce();
      const textElement = document.querySelector(
        ".scanner-text p",
      ) as HTMLElement;
      const iconElement = document.querySelector(
        ".fingerprint-icon",
      ) as HTMLElement;
      if (textElement && iconElement) {
        textElement.innerHTML =
          '<span class="spinner">🔍</span> Verificando...';
        textElement.style.color = "#ffc107";
        iconElement.innerHTML = "🔍";
      }
      const response = await fetch(`/api/biometric/verify/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        match?: boolean;
        score?: number;
        threshold?: number;
        message?: string;
      };
      Swal.close();
      const isError =
        data.ok === false && typeof data.score === "number" && data.score < 0;
      const baseMsg = data?.message || "";
      const extra = Number.isFinite(data?.score)
        ? ` (score=${data.score}, thr=${data?.threshold ?? "?"})`
        : "";
      await Swal.fire({
        ...swalBase,
        title: data?.match
          ? "✅ Huella verificada"
          : isError
            ? "❌ Error del lector"
            : "❌ No coincide",
        text: `${baseMsg}${extra}`,
        icon: data?.match ? "success" : "error",
        timer: 1800,
        showConfirmButton: false,
      });
      return data;
    } catch (error) {
      Swal.close();
      console.error("Error en verificación de huella:", error);
      toast.error("Error al verificar la huella. Intente nuevamente.");
      throw error;
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  };

  const handleDeleteClick = (id: string) => {
    setClientToDelete(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) {
      toast.error("No se pudo identificar al cliente a eliminar.");
      return;
    }
    const id = clientToDelete;
    try {
      setIsPageLoading(true);
      setDeleting((m) => ({ ...m, [id]: true }));
      const response = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData?.error || "Error al eliminar el cliente");
      }
      await mutate();
      setFilteredClients((prev) => prev.filter((c) => c.id !== id));
      toast.success("Cliente eliminado con éxito");
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al eliminar el cliente",
      );
    } finally {
      setDeleting((m) => ({ ...m, [id]: false }));
      setIsPageLoading(false);
      setShowConfirm(false);
      setClientToDelete(null);
    }
  };

  function BtnSpinner() {
    return (
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]"
        aria-label="Cargando"
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: W.black,
        color: "#fff",
        fontFamily: W.font,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <ToastContainer />

      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${W.line}`,
          background: W.black,
          padding: "16px 24px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 1760,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Users style={{ width: 28, height: 28, color: W.yellow }} />
              <h1
                style={{
                  fontFamily: W.display,
                  fontSize: 28,
                  letterSpacing: "0.04em",
                  color: "#fff",
                  margin: 0,
                }}
              >
                Clientes y Membresías
              </h1>
            </div>
            <p
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              Registro, planes, deudas y huellas de clientes activos.
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: W.yellow,
              color: W.black,
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Dashboard
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1760,
          margin: "0 auto",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Metric cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
          }}
        >
          <ClientMetric
            icon={<Users style={{ width: 16, height: 16 }} />}
            label="Clientes"
            value={totalClients}
          />
          <ClientMetric
            icon={<ShieldCheck style={{ width: 16, height: 16 }} />}
            label="Planes vigentes"
            value={activePlans}
            tone="yellow"
          />
          <ClientMetric
            icon={<Fingerprint style={{ width: 16, height: 16 }} />}
            label="Con huella"
            value={fingerprintCount}
          />
          <ClientMetric
            icon={<Activity style={{ width: 16, height: 16 }} />}
            label="Mostrando"
            value={filteredClients.length}
          />
        </section>

        {/* Search/filter bar */}
        <section style={{ ...cardStyle, padding: 20 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: W.yellow,
                  margin: "0 0 4px",
                }}
              >
                Búsqueda y acciones
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.35)",
                  margin: 0,
                }}
              >
                Filtra por nombre, apellido, usuario, teléfono o DNI.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <Search
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 15,
                    height: 15,
                    color: "rgba(255,255,255,0.35)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar cliente"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    height: 40,
                    paddingLeft: 34,
                    paddingRight: 12,
                    background: W.graph,
                    border: `1px solid ${W.line}`,
                    borderRadius: 10,
                    color: "#fff",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: W.font,
                    width: 260,
                  }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "all"
                      | "active"
                      | "expired"
                      | "noDate",
                  )
                }
                style={{
                  height: 40,
                  padding: "0 12px",
                  background: W.graph,
                  border: `1px solid ${W.line}`,
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: W.font,
                }}
                aria-label="Filtrar clientes por estado"
              >
                <option value="all">Todos</option>
                <option value="active">Solo activos</option>
                <option value="expired">Solo vencidos</option>
                <option value="noDate">Sin fecha</option>
              </select>
              <Button
                onClick={async () => {
                  await mutate();
                  toast.success("Listado actualizado");
                }}
                style={{
                  height: 40,
                  background: "transparent",
                  border: `1px solid ${W.lineStrong}`,
                  borderRadius: 10,
                  color: "rgba(255,255,255,0.8)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 14px",
                }}
              >
                <RefreshCcw style={{ width: 15, height: 15 }} />
                Refrescar
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    style={{
                      height: 40,
                      background: W.yellow,
                      border: `1px solid ${W.yellow}`,
                      borderRadius: 10,
                      color: W.black,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0 16px",
                    }}
                  >
                    <Plus style={{ width: 15, height: 15 }} />
                    Nuevo cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[92dvh] w-[min(96vw,48rem)] overflow-y-auto overflow-x-hidden border-zinc-800 bg-zinc-950 p-0">
                  <DialogTitle className="sr-only">...</DialogTitle>
                  <div className="p-0">
                    <AddClientDialog
                      onSave={async (newClient) => {
                        return await handleAddClient(newClient);
                      }}
                      onCredentialsUpdate={(cred) =>
                        persistPendingCredentials([
                          { ...cred },
                          ...pendingCredentials,
                        ])
                      }
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>

        {/* Clients table */}
        <section style={{ ...cardStyle, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${W.line}`,
            }}
          >
            <h2
              style={{
                fontFamily: W.display,
                fontSize: 20,
                color: "#fff",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              Directorio de clientes
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
                margin: "4px 0 0",
              }}
            >
              Vista operativa para pagos, huellas y edición de perfiles.
            </p>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 p-3 min-[1360px]:hidden">
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => {
                const uid = client.userId || client.id;
                const has = fpStatus[uid] ?? Boolean(client.hasFingerprint);
                const membershipDays = getMembershipDays(client.membershipEnd);
                return (
                  <article
                    key={client.id}
                    style={{
                      background: W.graph,
                      border: `1px solid ${W.lineStrong}`,
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div>
                        <p
                          style={{ fontWeight: 700, color: "#fff", margin: 0 }}
                        >
                          {client.firstName} {client.lastName}
                        </p>
                        <p
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.4)",
                            margin: "2px 0 0",
                          }}
                        >
                          DNI: {client.documentNumber || "Sin DNI"}
                        </p>
                      </div>
                      <span
                        style={{
                          background: "rgba(255,194,26,0.12)",
                          color: W.yellow,
                          border: `1px solid ${W.lineStrong}`,
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {client.plan}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            margin: "0 0 2px",
                          }}
                        >
                          Inicio
                        </p>
                        <p
                          style={{ color: "#fff", margin: 0, fontWeight: 500 }}
                        >
                          {client.membershipStart || "—"}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            margin: "0 0 2px",
                          }}
                        >
                          Fin
                        </p>
                        <p
                          style={{ color: "#fff", margin: 0, fontWeight: 500 }}
                        >
                          {client.membershipEnd || "—"}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            margin: "0 0 2px",
                          }}
                        >
                          Registro
                        </p>
                        <p
                          style={{ color: "#fff", margin: 0, fontWeight: 500 }}
                        >
                          {client.createdAt || "—"}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            margin: "0 0 2px",
                          }}
                        >
                          Días marcados
                        </p>
                        <p
                          style={{ color: "#fff", margin: 0, fontWeight: 500 }}
                        >
                          {client.attendanceDays}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            margin: "0 0 4px",
                          }}
                        >
                          Días
                        </p>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            ...membershipDays.style,
                          }}
                        >
                          {membershipDays.label}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: 14,
                        borderTop: `1px solid ${W.line}`,
                        paddingTop: 12,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.3)",
                          margin: "0 0 8px",
                        }}
                      >
                        Operaciones
                      </p>
                      <div className="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
                        <Button
                          onClick={() => {
                            setSelectedClientForDebt({
                              id: client.id,
                              name: `${client.firstName} ${client.lastName}`,
                              profileId: client.id,
                            });
                            setShowDebtDialog(true);
                          }}
                          className="w-full justify-center border border-white/15 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                        >
                          <BadgeDollarSign className="h-4 w-4" />
                          Cobros
                        </Button>
                        <Button
                          className={`${busy[uid] ? "cursor-not-allowed opacity-50" : "hover:bg-yellow-300"} w-full justify-center bg-yellow-400 text-black`}
                          onClick={() => registerFingerprint(uid)}
                          disabled={!!busy[uid] || !!deleting[uid]}
                        >
                          {has ? "Reemplazar huella" : "Registrar huella"}
                        </Button>
                        <div className="[&>button]:w-full [&>button]:justify-center">
                          <EditClientDialog
                            client={{ ...client, email: client.userName }}
                            onUpdate={async (updated) => {
                              await mutate();
                              setFilteredClients((prev) =>
                                prev.map((c) =>
                                  c.id === updated.id
                                    ? { ...c, ...updated }
                                    : c,
                                ),
                              );
                              toast.success("Cliente actualizado");
                            }}
                          />
                        </div>
                        <Button
                          className="w-full justify-center !border-white/15 !bg-zinc-900 !text-zinc-100 hover:!bg-zinc-800"
                          onClick={() => sendCredentials(client)}
                          disabled={!!busy[client.id] || !!deleting[client.id]}
                          variant="outline"
                        >
                          <Send className="h-4 w-4" />
                          Credenciales
                        </Button>
                        <Button
                          className="w-full justify-center border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white"
                          onClick={() => handleDeleteClick(client.id)}
                          disabled={!!deleting[client.id] || isPageLoading}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.3)",
                  padding: "24px 0",
                }}
              >
                No hay clientes disponibles.
              </p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto min-[1180px]:block">
            <Table className="w-full min-w-[1660px] table-auto border-separate border-spacing-y-1 text-sm [&_tbody_tr>td]:border-y [&_tbody_tr>td]:border-white/10 [&_tbody_tr>td]:bg-zinc-950/70 [&_tbody_tr>td:first-child]:rounded-l-md [&_tbody_tr>td:first-child]:border-l [&_tbody_tr>td:last-child]:rounded-r-md [&_tbody_tr>td:last-child]:border-r [&_tbody_tr:hover>td]:bg-zinc-900">
              <TableHeader className="sticky top-0 z-10 !bg-zinc-950">
                <TableRow className="border-zinc-800 !bg-zinc-950">
                  {[
                    { key: "firstName", label: "Nombre" },
                    { key: "lastName", label: "Apellidos" },
                    { key: "plan", label: "Plan" },
                    { key: "membershipStart", label: "Inicio" },
                    { key: "membershipEnd", label: "Fin" },
                  ].map(({ key, label }) => (
                    <TableHead key={key} style={thStyle}>
                      <button
                        onClick={() => toggleSort(key as SortKey)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          minWidth: 36,
                          minHeight: 36,
                          gap: 4,
                          background: "none",
                          border: "none",
                          color: W.faint,
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontFamily: W.font,
                        }}
                      >
                        {label}
                        {sortBy === key
                          ? sortDir === "asc"
                            ? " ▲"
                            : " ▼"
                          : ""}
                      </button>
                    </TableHead>
                  ))}
                  {["Días", "DNI"].map((h) => (
                    <TableHead key={h} style={thStyle}>
                      {h}
                    </TableHead>
                  ))}
                  <TableHead style={thStyle}>
                    <button
                      onClick={() => toggleSort("createdAt")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        minWidth: 36,
                        minHeight: 36,
                        gap: 4,
                        background: "none",
                        border: "none",
                        color: W.faint,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontFamily: W.font,
                      }}
                    >
                      Registro
                      {sortBy === "createdAt"
                        ? sortDir === "asc"
                          ? " ▲"
                          : " ▼"
                        : ""}
                    </button>
                  </TableHead>
                  {["Asistencia", "Huella", "Operaciones"].map((h) => (
                    <TableHead key={h} style={thStyle}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length > 0 ? (
                  filteredClients.map((client) => {
                    const uid = client.userId || client.id;
                    const has = fpStatus[uid] ?? Boolean(client.hasFingerprint);
                    const membershipDays = getMembershipDays(
                      client.membershipEnd,
                    );
                    return (
                      <TableRow key={client.id} className="border-0">
                        <TableCell
                          style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <UserRound
                              style={{
                                width: 15,
                                height: 15,
                                color: W.yellow,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {client.firstName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell style={tdStyle}>{client.lastName}</TableCell>
                        <TableCell style={tdStyle}>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "3px 8px",
                              borderRadius: 8,
                              background: "rgba(255,194,26,0.10)",
                              color: W.yellow,
                              border: `1px solid ${W.line}`,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {client.plan}
                          </span>
                        </TableCell>
                        <TableCell style={tdStyle}>
                          {client.membershipStart || "—"}
                        </TableCell>
                        <TableCell style={tdStyle}>
                          {client.membershipEnd || "—"}
                        </TableCell>
                        <TableCell style={tdStyle}>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "3px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              ...membershipDays.style,
                            }}
                          >
                            {membershipDays.label}
                          </span>
                        </TableCell>
                        <TableCell style={tdStyle}>
                          {client.documentNumber || "—"}
                        </TableCell>
                        <TableCell style={tdStyle}>
                          {client.createdAt || "—"}
                        </TableCell>
                        <TableCell style={tdStyle}>
                          <AttendanceSummary
                            days={client.attendanceDays}
                            channels={client.attendanceChannels}
                          />
                        </TableCell>
                        <TableCell style={tdStyle}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              ...(has
                                ? {
                                    background: "rgba(46,189,117,0.12)",
                                    color: "#2EBD75",
                                    border: "1px solid rgba(46,189,117,0.35)",
                                  }
                                : {
                                    background: "rgba(229,72,77,0.12)",
                                    color: "#E5484D",
                                    border: "1px solid rgba(229,72,77,0.35)",
                                  }),
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: has ? "#2EBD75" : "#E5484D",
                                flexShrink: 0,
                              }}
                            />
                            {has ? "Registrada" : "Sin huella"}
                          </span>
                        </TableCell>
                        <TableCell style={{ ...tdStyle, minWidth: 610 }}>
                          <div className="flex min-w-max items-center gap-1.5">
                            <Button
                              onClick={() => {
                                setSelectedClientForDebt({
                                  id: client.id,
                                  name: `${client.firstName} ${client.lastName}`,
                                  profileId: client.id,
                                });
                                setShowDebtDialog(true);
                              }}
                              className="h-9 border border-white/15 bg-zinc-900 px-2.5 text-xs text-zinc-100 hover:bg-zinc-800"
                            >
                              <BadgeDollarSign className="h-3.5 w-3.5" />
                              Cobros
                            </Button>
                            <Button
                              className={`${busy[uid] ? "opacity-50 cursor-not-allowed" : "hover:bg-yellow-300"} h-9 whitespace-nowrap bg-yellow-400 px-2.5 text-xs text-black`}
                              onClick={() => registerFingerprint(uid)}
                              disabled={!!busy[uid] || !!deleting[uid]}
                            >
                              {busy[uid] ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              {has ? "Reemplazar" : "Registrar huella"}
                            </Button>
                            <Button
                              className={`h-9 px-2.5 text-xs !border-white/15 !bg-zinc-900 !text-zinc-100 hover:!bg-zinc-800 ${busy[uid] ? "opacity-50 cursor-not-allowed" : ""}`}
                              onClick={() => verifyFingerprint(uid)}
                              disabled={!!busy[uid] || !!deleting[uid]}
                              variant="outline"
                            >
                              Verificar
                            </Button>
                            <div className="[&>button]:h-9 [&>button]:px-2.5 [&>button]:text-xs">
                              <EditClientDialog
                                client={{ ...client, email: client.userName }}
                                onUpdate={async (updated) => {
                                  await mutate();
                                  setFilteredClients((prev) =>
                                    prev.map((c) =>
                                      c.id === updated.id
                                        ? { ...c, ...updated }
                                        : c,
                                    ),
                                  );
                                  toast.success("Cliente actualizado");
                                }}
                              />
                            </div>
                            <Button
                              className="inline-flex h-9 items-center gap-1 px-2.5 text-xs !border-white/15 !bg-zinc-900 !text-zinc-100 hover:!bg-zinc-800"
                              onClick={() => sendCredentials(client)}
                              disabled={
                                !!busy[client.id] || !!deleting[client.id]
                              }
                              variant="outline"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Credenciales
                            </Button>
                            <Button
                              className="inline-flex h-9 items-center gap-1 border border-red-500/40 bg-red-500/10 px-2.5 text-xs text-red-300 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => handleDeleteClick(client.id)}
                              disabled={!!deleting[client.id] || isPageLoading}
                            >
                              {deleting[client.id] ? (
                                <span className="flex items-center gap-2">
                                  <BtnSpinner /> Eliminando…
                                </span>
                              ) : (
                                <>
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Eliminar
                                </>
                              )}
                            </Button>
                            <Button
                              title="Eliminar huella"
                              aria-label="Eliminar huella"
                              className={`h-9 w-9 p-0 !border-red-500/40 !bg-red-500/10 !text-red-300 hover:!bg-red-500 hover:!text-white ${busy[uid] ? "opacity-50 cursor-not-allowed" : ""}`}
                              onClick={() => deleteFingerprint(uid)}
                              disabled={!!busy[uid] || !!deleting[uid]}
                              variant="outline"
                            >
                              <Fingerprint className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      style={{
                        ...tdStyle,
                        textAlign: "center",
                        padding: 40,
                        color: "rgba(255,255,255,0.3)",
                      }}
                    >
                      No hay clientes disponibles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Pending credentials */}
        <section style={{ ...cardStyle, padding: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <UserRound style={{ width: 18, height: 18, color: W.yellow }} />
            <h2
              style={{
                fontFamily: W.display,
                fontSize: 20,
                color: "#fff",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              Accesos pendientes
            </h2>
          </div>
          {pendingCredentials.length > 0 ? (
            pendingCredentials.map((cred, index) => (
              <div
                key={index}
                style={{
                  marginBottom: 12,
                  background: W.graph,
                  border: `1px solid ${W.line}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    fontSize: 13,
                    color: W.muted,
                    marginBottom: 12,
                  }}
                >
                  <p style={{ margin: 0 }}>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        display: "block",
                        fontSize: 11,
                        marginBottom: 2,
                      }}
                    >
                      Usuario
                    </span>
                    {cred.username}
                  </p>
                  <p style={{ margin: 0 }}>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        display: "block",
                        fontSize: 11,
                        marginBottom: 2,
                      }}
                    >
                      Contraseña
                    </span>
                    {cred.password}
                  </p>
                  <p style={{ margin: 0 }}>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        display: "block",
                        fontSize: 11,
                        marginBottom: 2,
                      }}
                    >
                      Teléfono
                    </span>
                    {cred.phone}
                  </p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    className="bg-yellow-400 text-black hover:bg-yellow-300"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        cred.message ||
                          `Usuario: ${cred.username}\nContraseña: ${cred.password}\nTeléfono: ${cred.phone}`,
                      );
                      toast.success("Credenciales copiadas al portapapeles.");
                    }}
                  >
                    Copiar
                  </Button>
                  <Button
                    className="bg-green-600 text-white hover:bg-green-500"
                    onClick={() =>
                      window.open(
                        cred.whatsappUrl ||
                          `https://wa.me/${cred.phone}?text=${encodeURIComponent(cred.message || `Usuario: ${cred.username}\nContraseña: ${cred.password}`)}`,
                        "_blank",
                      )
                    }
                  >
                    Abrir chat en WhatsApp
                  </Button>
                  <Button
                    className="bg-red-500 text-white hover:bg-red-600"
                    onClick={() => {
                      const updated = pendingCredentials.filter(
                        (_, i) => i !== index,
                      );
                      localStorage.setItem(
                        "pendingCredentials",
                        JSON.stringify(updated),
                      );
                      setPendingCredentials(updated);
                    }}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.3)",
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              No hay accesos pendientes.
            </p>
          )}
        </section>
      </main>

      {isPageLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(20,20,20,0.95)",
              border: `1px solid ${W.yellow}`,
              borderRadius: 12,
              padding: "14px 20px",
              color: "#fff",
            }}
          >
            <BtnSpinner />
            <span>Procesando…</span>
          </div>
        </div>
      )}
      {showConfirm && (
        <ConfirmDialog
          message="¿Estás seguro de que deseas eliminar este cliente?"
          onConfirm={confirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {selectedClientForDebt && (
        <DebtManagement
          isOpen={showDebtDialog}
          onClose={() => {
            setShowDebtDialog(false);
            setSelectedClientForDebt(null);
          }}
          clientId={selectedClientForDebt.id}
          clientName={selectedClientForDebt.name}
          profileId={selectedClientForDebt.profileId}
        />
      )}
    </div>
  );
}

function ClientMetric({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone?: "default" | "yellow";
}) {
  return (
    <div
      style={{
        background: "#141414",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: tone === "yellow" ? "#FFC21A" : "rgba(255,255,255,0.4)",
          marginBottom: 10,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
          fontSize: 36,
          color: "#fff",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AttendanceSummary({
  days,
  channels,
}: {
  days: number;
  channels: Record<string, number>;
}) {
  const known = [
    ["fingerprint", "Huella"],
    ["dni", "DNI"],
    ["phone", "Teléfono"],
  ] as const;
  const details = known
    .filter(([channel]) => channels[channel])
    .map(([channel, label]) => `${label}: ${channels[channel]}`);
  if (channels.unknown) details.push(`Histórico: ${channels.unknown}`);

  return (
    <div className="min-w-[118px]">
      <strong className="block text-sm text-white">
        {days} {days === 1 ? "día" : "días"}
      </strong>
      <span className="block text-[11px] leading-4 text-zinc-500">
        {details.length ? details.join(" · ") : "Sin marcaciones"}
      </span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          margin: "0 0 2px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", margin: 0 }}>
        {value}
      </p>
    </div>
  );
}
// keep Info exported for potential use
export { Info };
