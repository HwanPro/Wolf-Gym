"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Home, Menu, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface DashboardData {
  totalIncome: number;
  newClients: number;
  productSales: number;
  classAttendance: number;
  todayAttendance: number;
  activeMemberships: number;
  lowStockProducts: number;
  lastUpdated: string;
}

interface RecentClient {
  id: string;
  name: string;
  lastName: string;
  plan: string;
  membershipStartFormatted: string;
  membershipEndFormatted: string;
  daysRemaining: number | string;
}

interface Product {
  item_id: string;
  item_name: string;
  item_stock: number;
}

interface Notification {
  id: string;
  message: string;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "warning" | "success";
}

const emptyDashboardData: DashboardData = {
  totalIncome: 0,
  newClients: 0,
  productSales: 0,
  classAttendance: 0,
  todayAttendance: 0,
  activeMemberships: 0,
  lowStockProducts: 0,
  lastUpdated: "",
};

const navigationItems = [
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/products", label: "Productos" },
  { href: "/admin/sales", label: "Ventas" },
  { href: "/admin/images", label: "Imágenes" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/profile", label: "Perfil" },
  { href: "/admin/attendence", label: "Historial" },
  { href: "/check-in", label: "Recepción" },
  { href: "/admin/routines", label: "Rutinas" },
  { href: "/admin/Edit", label: "Contenido" },
];

function formatCurrency(value: number) {
  return `S/. ${Number(value).toFixed(2)}`;
}

function formatDate(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString("es-PE");
}

function getDaysRemaining(value?: string) {
  if (!value) return "N/A";
  const membershipEnd = new Date(value);
  if (Number.isNaN(membershipEnd.getTime())) return "N/A";
  const timeDiff = membershipEnd.getTime() - Date.now();
  return timeDiff > 0 ? Math.ceil(timeDiff / (1000 * 3600 * 24)) : "Finalizado";
}

function MetricCard({ label, value, helper, tone = "default" }: MetricCardProps) {
  const toneClass =
    tone === "success"
      ? "wolf-tone-success"
      : tone === "warning"
        ? "wolf-tone-warning"
        : "";

  return (
    <div className="wolf-stat">
      <span className="wolf-stat-label">{label}</span>
      <strong className={`wolf-stat-value ${toneClass}`}>{value}</strong>
      <span className="wolf-stat-helper">{helper}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const isRedirecting = useRef(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications] = useState<Notification[]>([]);
  const [dashboardData, setDashboardData] =
    useState<DashboardData>(emptyDashboardData);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [metricsErrorShown, setMetricsErrorShown] = useState(false);

  const lastUpdatedDate = dashboardData.lastUpdated
    ? new Date(dashboardData.lastUpdated)
    : null;
  const lastUpdatedLabel =
    lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime())
      ? lastUpdatedDate.toLocaleString("es-PE")
      : "Sin actualización";

  function redirectToLogin() {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    toast.error("Sesión expirada. Redirigiendo a login...");
    router.replace("/auth/login");
  }

  async function fetchDashboard(silent = false) {
    try {
      const res = await fetch("/api/admin/metrics", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) { redirectToLogin(); return; }
        throw new Error("Error al obtener métricas");
      }
      const data = await res.json();
      setDashboardData({
        totalIncome: Number(data?.totalIncome ?? 0),
        newClients: Number(data?.newClients ?? 0),
        productSales: Number(data?.productSales ?? 0),
        classAttendance: Number(data?.classAttendance ?? 0),
        todayAttendance: Number(data?.todayAttendance ?? 0),
        activeMemberships: Number(data?.activeMemberships ?? 0),
        lowStockProducts: Number(data?.lowStockProducts ?? 0),
        lastUpdated: data?.lastUpdated || new Date().toISOString(),
      });
      if (metricsErrorShown) setMetricsErrorShown(false);
    } catch (error) {
      console.error("Error fetchDashboard:", error);
      if (!silent && !metricsErrorShown) {
        toast.error("Error al cargar métricas del dashboard");
        setMetricsErrorShown(true);
      }
    }
  }

  async function fetchRecentClients(silent = false) {
    if (!silent) setLoadingClients(true);
    try {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401) { redirectToLogin(); return; }
        throw new Error("Error al obtener los clientes recientes");
      }
      const data = await response.json();
      const filtered = data.filter(
        (client: { user: { role: string } }) => client.user.role !== "admin",
      );
      setRecentClients(
        filtered.map(
          (client: {
            profile_id: string;
            profile_first_name: string;
            profile_last_name: string;
            profile_plan: string;
            profile_start_date?: string;
            profile_end_date?: string;
          }) => ({
            id: client.profile_id,
            name: client.profile_first_name || "Sin nombre",
            lastName: client.profile_last_name || "Sin apellido",
            plan: client.profile_plan || "Sin plan",
            membershipStartFormatted: formatDate(client.profile_start_date),
            membershipEndFormatted: formatDate(client.profile_end_date),
            daysRemaining: getDaysRemaining(client.profile_end_date),
          }),
        ),
      );
    } catch (error) {
      console.error("Error fetching recent clients:", error);
      if (!silent) toast.error("Error al obtener los clientes recientes");
    } finally {
      if (!silent) setLoadingClients(false);
    }
  }

  async function fetchProducts(silent = false) {
    if (!silent) setLoadingProducts(true);
    try {
      const response = await fetch("/api/products", { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401) { redirectToLogin(); return; }
        throw new Error("Error al obtener los productos");
      }
      setProducts(await response.json());
    } catch (error) {
      console.error("Error al obtener los productos:", error);
      if (!silent) toast.error("Error al obtener los productos");
    } finally {
      if (!silent) setLoadingProducts(false);
    }
  }

  async function refreshAll(silent = false) {
    if (silent) setRefreshing(true);
    await Promise.all([
      fetchDashboard(silent),
      fetchRecentClients(silent),
      fetchProducts(silent),
    ]);
    if (silent) setRefreshing(false);
  }

  useEffect(() => {
    refreshAll(false);
    const interval = setInterval(async () => {
      await refreshAll(true);
    }, 300000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wolf-app">
      <ToastContainer position="top-right" autoClose={3000} />
      <header className="wolf-topbar">
        <div className="wolf-topbar-inner">
          <Link href="/admin/dashboard" className="wolf-brand-link">
            <span className="wolf-brand-mark">WG</span>
            <span>Wolf Gym Admin</span>
          </Link>
          <nav
            className="wolf-nav"
            data-open={isMenuOpen}
            aria-label="Navegación administrativa"
          >
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="wolf-nav-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <Link href="/" className="wolf-icon-button" aria-label="Volver al inicio">
              <Home className="h-[18px] w-[18px]" />
            </Link>
            <button
              type="button"
              aria-label="Mostrar notificaciones"
              aria-expanded={notificationsOpen}
              className="wolf-icon-button relative"
              onClick={() => setNotificationsOpen((prev) => !prev)}
            >
              <Bell className="h-[18px] w-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={isMenuOpen}
              className="wolf-icon-button lg:hidden"
              onClick={() => setIsMenuOpen((prev) => !prev)}
            >
              {isMenuOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
          {notificationsOpen && (
            <div className="wolf-menu-popover" role="status">
              <h3 className="mb-2 text-sm font-bold">Notificaciones</h3>
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <p key={notification.id} className="mb-2 text-[13px] text-[var(--wolf-app-muted)]">
                    {notification.message}
                  </p>
                ))
              ) : (
                <p className="text-[13px] text-[var(--wolf-app-faint)]">No hay notificaciones pendientes.</p>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="wolf-shell">
        <div className="wolf-page-heading">
          <div>
            <p className="wolf-kicker">Operación diaria</p>
            <h1 className="wolf-title">Panel administrativo</h1>
            <p className="wolf-subtitle">Resumen de clientes, asistencia, ventas e inventario.</p>
          </div>
          <button type="button" onClick={() => refreshAll(true)} disabled={refreshing} className="wolf-button">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Actualizando" : "Actualizar datos"}
          </button>
        </div>

        <section className="wolf-panel wolf-summary" aria-label="Resumen de hoy">
          <div>
            <p className="wolf-kicker">Hoy</p>
            <p className="wolf-summary-value"><strong>{dashboardData.todayAttendance}</strong> check-ins</p>
            <p className="wolf-subtitle">Última actualización: {lastUpdatedLabel}</p>
          </div>
          <div className="wolf-summary-actions">
            <div className="wolf-mini-stat">
              <span>Activos</span>
              <strong className="wolf-tone-success">{dashboardData.activeMemberships}</strong>
            </div>
            <div className="wolf-mini-stat">
              <span>Stock bajo</span>
              <strong className={dashboardData.lowStockProducts > 0 ? "wolf-tone-warning" : ""}>{dashboardData.lowStockProducts}</strong>
            </div>
          </div>
        </section>

        <section className="wolf-stat-grid" aria-label="Indicadores administrativos">
          <MetricCard label="Ingresos totales" value={formatCurrency(dashboardData.totalIncome)} helper="Todos los pagos" tone="success" />
          <MetricCard label="Nuevos clientes" value={dashboardData.newClients} helper="Últimos 30 días" />
          <MetricCard label="Asistencia hoy" value={dashboardData.todayAttendance} helper="Check-ins de hoy" />
          <MetricCard label="Membresías activas" value={dashboardData.activeMemberships} helper="Clientes activos" />
          <MetricCard label="Asistencia semanal" value={dashboardData.classAttendance} helper="Últimos 7 días" />
          <MetricCard label="Ventas de productos" value={formatCurrency(dashboardData.productSales)} helper="Total vendido" tone="success" />
          <MetricCard label="Stock bajo" value={dashboardData.lowStockProducts} helper="Productos ≤ 10 unidades" tone={dashboardData.lowStockProducts > 0 ? "warning" : "default"} />
        </section>
        {refreshing && <p className="wolf-loading py-2 text-left">Actualizando datos...</p>}

        <section className="wolf-panel mb-5 overflow-hidden">
          <div className="wolf-panel-header">
            <h2 className="wolf-panel-title">Clientes recientes</h2>
            <Link href="/admin/clients" className="wolf-nav-link">Ver clientes</Link>
          </div>
          {loadingClients ? (
            <p className="wolf-loading">Cargando clientes...</p>
          ) : (
            <div className="wolf-table-wrap">
              <table className="wolf-table">
                <thead>
                  <tr>
                    {["Nombre", "Apellidos", "Plan", "Inicio", "Fin", "Días"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentClients.length > 0 ? (
                    recentClients.map((client) => (
                      <tr key={client.id}>
                        <td className="font-semibold text-[var(--wolf-app-text)]">{client.name}</td>
                        <td>{client.lastName}</td>
                        <td>{client.plan}</td>
                        <td>{client.membershipStartFormatted}</td>
                        <td>{client.membershipEndFormatted}</td>
                        <td>{client.daysRemaining}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="wolf-empty">
                        No hay clientes disponibles
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="wolf-panel overflow-hidden">
          <div className="wolf-panel-header">
            <h2 className="wolf-panel-title">Inventario</h2>
            <Link href="/admin/products" className="wolf-nav-link">Gestionar productos</Link>
          </div>
          {loadingProducts ? (
            <p className="wolf-loading">Cargando productos...</p>
          ) : (
            <div className="wolf-table-wrap">
              <table className="wolf-table min-w-[420px]">
                <thead>
                  <tr>
                    {["Nombre", "Stock"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length > 0 ? (
                    products.map((product) => (
                      <tr key={product.item_id}>
                        <td className="font-semibold text-[var(--wolf-app-text)]">{product.item_name}</td>
                        <td className={product.item_stock <= 10 ? "wolf-tone-warning font-semibold" : ""}>
                          {product.item_stock}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="wolf-empty">
                        No hay productos disponibles
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
