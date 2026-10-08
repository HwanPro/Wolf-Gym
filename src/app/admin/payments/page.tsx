"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Attempt = { id: string; customer: string; state: string; amountCents: number; gatewayMode: string; paymentId: number; chargeId: string | null; createdAt: string };
const labels: Record<string, string> = { RESERVED: "Reservado", DISPATCHING: "Enviado a Culqi", REQUIRES_3DS: "Autenticación pendiente", CHARGED: "Cargo confirmado, por completar", REVIEW: "Pendiente de confirmación", COMPLETED: "Completado", FAILED: "No completado" };

export default function OnlinePaymentsPage() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [view, setView] = useState("pending");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/payments?view=${view}&page=${page}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los pagos");
      setRows(data.attempts); setHasNext(data.hasNext);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron cargar los pagos"); }
    finally { setLoading(false); }
  }, [page, view]);
  useEffect(() => { void load(); }, [load]);
  const reconcile = async (row: Attempt) => {
    setWorking(row.id); setMessage("");
    try {
      const chargeId = (row.chargeId || references[row.id] || "").trim();
      if (!/^chr_(test|live)_[A-Za-z0-9]+$/.test(chargeId)) throw new Error("Introduce la referencia del cargo que aparece en Culqi");
      const response = await fetch(`/api/admin/payments/${row.id}/reconcile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chargeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo verificar el pago");
      setMessage(data.state === "COMPLETED" ? "Pago conciliado. Compra completada." : "Rechazo confirmado en Culqi. Reserva liberada."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo verificar el pago"); }
    finally { setWorking(null); }
  };
  return <main className="min-h-screen bg-zinc-950 p-4 text-white md:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/admin/dashboard" className="text-yellow-300 underline">Volver al panel</Link>
      <h1 className="text-3xl font-bold">Pagos online</h1>
      <p className="text-zinc-200">Comprueba la referencia en Culqi antes de conciliar. La conciliación verifica el cargo y completa la compra sin realizar otro cobro.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="payment-view">Mostrar</label>
        <select id="payment-view" value={view} onChange={event => { setView(event.target.value); setPage(1); }} className="rounded border border-zinc-500 bg-zinc-900 p-2">
          <option value="pending">Pendientes</option><option value="all">Todos</option>
        </select>
        <button type="button" onClick={load} disabled={loading || Boolean(working)} className="rounded border border-yellow-300 px-3 py-2">Actualizar</button>
      </div>
      {message && <p role="status" className="rounded border border-yellow-300 p-3">{message}</p>}
      {loading && <p role="status">Cargando pagos…</p>}
      {!loading && rows.length === 0 && <p>No hay pagos para este filtro.</p>}
      {rows.map(row => <article key={row.id} data-payment-id={row.id} className="space-y-3 rounded border border-zinc-600 bg-zinc-900 p-4">
        <h2 className="font-semibold">Pago #{row.paymentId} · {row.customer}</h2>
        <p>S/{(row.amountCents / 100).toFixed(2)} · {row.gatewayMode === "test" ? "Modo de prueba" : "Producción"} · {labels[row.state] || row.state}</p>
        <p className="text-sm text-zinc-300">{new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(row.createdAt))}</p>
        {["CHARGED", "REVIEW", "DISPATCHING"].includes(row.state) && <form onSubmit={event => { event.preventDefault(); void reconcile(row); }} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><label htmlFor={`charge-${row.id}`} className="mb-1 block">Referencia del cargo en Culqi</label>
            <input id={`charge-${row.id}`} value={row.chargeId || references[row.id] || ""} onChange={event => setReferences(current => ({ ...current, [row.id]: event.target.value }))} readOnly={Boolean(row.chargeId)} required pattern="chr_(test|live)_[A-Za-z0-9]+" className="w-full rounded border border-zinc-500 bg-zinc-950 p-2" />
          </div>
          <button type="submit" disabled={Boolean(working)} className="rounded bg-yellow-400 px-4 py-2 font-semibold text-black">{working === row.id ? "Verificando…" : "Verificar en Culqi y completar"}</button>
        </form>}
      </article>)}
      <nav aria-label="Páginas de pagos" className="flex items-center gap-4">
        <button type="button" disabled={page === 1 || loading || Boolean(working)} onClick={() => setPage(page - 1)} className="rounded border px-3 py-2 disabled:opacity-40">Anterior</button>
        <span>Página {page}</span>
        <button type="button" disabled={!hasNext || loading || Boolean(working)} onClick={() => setPage(page + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Siguiente</button>
      </nav>
    </div>
  </main>;
}
