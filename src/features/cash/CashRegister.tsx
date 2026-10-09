"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CashData, Sale, sol, methods } from "./types";
import { Checkout } from "./Checkout";
import { SessionPanel } from "./SessionPanel";
import { Ledger } from "./Ledger";
import styles from "./cash.module.css";

type Pending = { key: string; kind: string; body: unknown };
const storageKey = "wolf.cash.pending";
export default function CashRegister() {
  const [data, setData] = useState<CashData | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [checkoutVersion, setCheckoutVersion] = useState(0);
  const inFlight = useRef(false);
  const retryAt = useRef(0);
  const responseError = useCallback((response: Response, fallback: string) => {
    if (response.status === 401) return "Tu sesión venció. Inicia sesión para continuar.";
    if (response.status === 403) return "No tienes permiso para realizar esta operación.";
    if (response.status === 404) return "No se encontró el recurso. Actualiza la caja y revisa la selección.";
    if (response.status === 409) return "Los datos cambiaron. Actualiza la caja y revisa la operación.";
    if (response.status === 429) {
      const header = response.headers.get("Retry-After");
      const numeric = Number(header);
      const seconds = header && Number.isFinite(numeric)
        ? Math.max(1, Math.ceil(numeric))
        : Math.max(1, Math.ceil(((header ? Date.parse(header) : NaN) - Date.now()) / 1000) || 30);
      retryAt.current = Date.now() + seconds * 1000;
      return `Demasiados intentos. Espera ${seconds} segundos antes de reintentar.`;
    }
    if (response.status >= 500) return "El servicio no está disponible. Conserva la operación y reintenta.";
    return fallback;
  }, []);
  const refresh = useCallback(async () => {
    if (Date.now() < retryAt.current) throw new Error("Espera antes de reintentar; todavía no terminó el plazo indicado.");
    const response = await fetch(`/api/admin/cash${date ? `?date=${date}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(responseError(response, "No se pudo cargar la caja. Revisa los datos y reintenta."));
    const next: CashData = await response.json();
    setData(next);
    setError("");
  }, [date, responseError]);
  useEffect(() => {
    void refresh().catch(error => setError(error.message));
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 30000);
    const onFocus = () => { void refresh().catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved) setPending(JSON.parse(saved)); } catch { sessionStorage.removeItem(storageKey); }
  }, []);
  const send = async (intent: Pending) => {
    if (Date.now() < retryAt.current) throw new Error("Espera antes de reintentar; todavía no terminó el plazo indicado.");
    if (inFlight.current) throw new Error("Hay una operación en curso");
    inFlight.current = true; setBusy(true); setError("");
    setPending(intent); sessionStorage.setItem(storageKey, JSON.stringify(intent));
    try {
      const response = await fetch(`/api/admin/cash/${intent.kind}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intent.key }, body: JSON.stringify(intent.body), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500 && ![401, 403, 428, 429].includes(response.status)) { setPending(null); sessionStorage.removeItem(storageKey); }
        throw new Error(responseError(response, typeof result.error === "string" ? result.error : "No se pudo confirmar la operación"));
      }
      setPending(null); sessionStorage.removeItem(storageKey);
      if (["sale", "collect", "void"].includes(intent.kind)) setReceipt(result.result as Sale);
      if (intent.kind === "sale") setCheckoutVersion(value => value + 1);
      await refresh().catch(() => setError("Operación confirmada; actualice para cargar el saldo."));
      return result.result;
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo confirmar. Reintente con la misma clave.");
      throw error;
    } finally { setBusy(false); inFlight.current = false; }
  };
  const act = (kind: string, body: unknown) => {
    if (pending) return Promise.reject(new Error("Primero resuelva la operación pendiente"));
    return send({ kind, body, key: crypto.randomUUID() });
  };
  const consult = async () => {
    if (!pending) return;
    try {
      const response = await fetch(`/api/admin/cash/actions?kind=${pending.kind}&key=${pending.key}`);
      const result = await response.json();
      if (response.ok) {
        if (["sale", "collect", "void"].includes(pending.kind)) setReceipt(result.result);
        if (pending.kind === "sale") setCheckoutVersion(value => value + 1);
        setPending(null); sessionStorage.removeItem(storageKey); await refresh();
      } else setError("La operación aún no está registrada. Puede reenviarla con su misma clave.");
    } catch { setError("No se pudo consultar. Conserve la operación pendiente."); }
  };
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Wolf Gym · Punto de venta</p><h1>Caja y ventas</h1><p>Productos, servicios y cobros desde el inventario central.</p></div><div className={styles.actions}><Link href="/admin/products">Administrar catálogo</Link><button onClick={() => { void refresh().catch(error => setError(error.message)); }}>Actualizar</button></div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {error === "Tu sesión venció. Inicia sesión para continuar." && <Link href="/auth/login">Iniciar sesión</Link>}
    {pending && <div className={styles.warning} role="status">Hay una operación por confirmar. <button disabled={busy} onClick={() => { void consult(); }}>Consultar resultado</button><button disabled={busy} onClick={() => { void send(pending).catch(() => {}); }}>Reintentar misma operación</button></div>}
    {!data ? <p role="status">Cargando caja…</p> : <>
      <div className={styles.stats}><div><span>Ventas del día</span><strong>{sol(data.totals._sum.totalCents ?? 0)}</strong><small>{data.totals._count} tickets vigentes</small></div><div><span>Cobrado del día</span><strong>{sol(data.payments.reduce((sum, row) => sum + Math.round(Number(row._sum.payment_amount) * 100), 0))}</strong><small>{data.payments.map(row => `${methods[row.tenderMethod as keyof typeof methods] ?? row.tenderMethod}: ${sol(Math.round(Number(row._sum.payment_amount) * 100))}`).join(" · ") || "Sin cobros"}</small></div><div><span>Saldo de ventas del día</span><strong>{sol(data.totals._sum.dueCents ?? 0)}</strong><small>Créditos de las ventas de la fecha seleccionada</small></div></div>
      <SessionPanel data={data} act={act} disabled={busy || Boolean(pending)} />
      <Checkout key={checkoutVersion} data={data} act={act} disabled={busy || Boolean(pending)} />
      <Ledger data={data} date={date || data.date} setDate={setDate} act={act} disabled={busy || Boolean(pending)} setReceipt={setReceipt} />
    </>}
    {receipt && <section className={`${styles.panel} ${styles.receipt}`} aria-label="Comprobante de venta"><div className={styles.row}><h2>Ticket #{receipt.number} · {receipt.status === "VOIDED" ? "Anulado" : "Venta"}</h2><button onClick={() => setReceipt(null)}>Cerrar ticket</button><button onClick={() => window.print()}>Imprimir ticket</button></div><p>{receipt.customerName} · {new Date(receipt.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}</p>{receipt.lines.map(line => <div className={styles.row} key={line.id}><span>{line.quantity} × {line.productName}</span><strong>{sol(line.totalCents)}</strong></div>)}<hr /><p>Total: {sol(receipt.totalCents)} · Cobrado: {sol(receipt.paidCents)} · Pendiente: {sol(receipt.dueCents)} · Vuelto inicial: {sol(receipt.changeCents)}</p>{receipt.payments.map(payment => <p key={payment.payment_id}>{methods[payment.tenderMethod as keyof typeof methods]}: S/ {payment.payment_amount} · {payment.payment_status === "REFUNDED" ? "Reversado en caja" : "Registrado"} {payment.externalRef && `· ${payment.externalRef}`}</p>)}{receipt.note && <p>{receipt.note}</p>}{receipt.voidReason && <p>Motivo de anulación: {receipt.voidReason}</p>}<small>Comprobante interno de caja. No constituye comprobante tributario. Los pagos externos y sus devoluciones se verifican con el proveedor.</small></section>}
  </main>;
}
