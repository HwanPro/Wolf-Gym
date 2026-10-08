"use client";
import { useState } from "react";
import { CashAction, CashData, Sale, Tender, sol, statusName } from "./types";
import { PaymentFields } from "./PaymentFields";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import styles from "./cash.module.css";
function csvCell(value: string) { return `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`; }
export function Ledger({ data, date, setDate, act, disabled, setReceipt }: { data: CashData; date: string; setDate: (value: string) => void; act: CashAction; disabled: boolean; setReceipt: (value: Sale) => void }) {
  const [filter, setFilter] = useState(""), [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sale | null>(null), [operation, setOperation] = useState<"collect" | "void">("collect");
  const [payments, setPayments] = useState<Tender[]>([]), [tendered, setTendered] = useState("");
  const [reason, setReason] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState("");
  const sales = data.sales.filter(sale => (!filter || sale.status === filter) && `${sale.number} ${sale.customerName}`.toLowerCase().includes(search.toLowerCase()));
  const open = (sale: Sale, action: "collect" | "void") => { setSelected(sale); setOperation(action); setReason(""); setPassword(""); setPayments([{ method: "CASH", amount: sale.dueCents / 100, reference: "" }]); setTendered(String(sale.dueCents / 100)); setError(""); };
  const submit = async () => {
    if (!selected) return;
    try {
      if (operation === "void") {
        const response = await fetch("/api/admin/sensitive-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Verificación fallida");
        await act("void", { saleId: selected.id, reason });
      } else {
        if (!data.session) throw new Error("Abra caja para cobrar");
        await act("collect", { saleId: selected.id, sessionId: data.session.id, payments, cashTendered: payments.some(row => row.method === "CASH") ? Number(tendered) : 0 });
      }
      setSelected(null); setPassword("");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo completar"); }
  };
  const exportCsv = () => {
    const rows = [["Ticket", "Fecha Lima", "Cliente", "Estado", "Total PEN", "Cobrado PEN", "Pendiente PEN"], ...sales.map(sale => [String(sale.number), new Date(sale.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" }), sale.customerName, statusName(sale.status), (sale.totalCents / 100).toFixed(2), (sale.paidCents / 100).toFixed(2), (sale.dueCents / 100).toFixed(2)])];
    const url = URL.createObjectURL(new Blob(["\ufeff", rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `caja-${date}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <>
    <section className={styles.panel}><div className={styles.row}><h2>Historial de ventas</h2><button onClick={exportCsv}>Exportar ventas visibles</button></div><div className={styles.formRow}><label>Fecha Lima<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label>Estado<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">Todos</option><option value="COMPLETED">Pagada</option><option value="CREDIT">Saldo pendiente</option><option value="VOIDED">Anulada</option></select></label><label>Buscar ticket / cliente<input value={search} onChange={event => setSearch(event.target.value)} /></label></div><div className={styles.table}><table><thead><tr><th>Ticket / cliente</th><th>Estado</th><th>Total</th><th>Saldo</th><th>Acciones</th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td>#{sale.number} · {sale.customerName}<small>{new Date(sale.createdAt).toLocaleTimeString("es-PE", { timeZone: "America/Lima" })}</small></td><td>{statusName(sale.status)}</td><td>{sol(sale.totalCents)}</td><td>{sol(sale.dueCents)}</td><td><button onClick={() => setReceipt(sale)}>Ver ticket</button>{sale.dueCents > 0 && <button disabled={disabled || !data.session} onClick={() => open(sale, "collect")}>Cobrar</button>}{sale.status !== "VOIDED" && sale.sessionId === data.session?.id && <button disabled={disabled} onClick={() => open(sale, "void")}>Anular</button>}</td></tr>)}</tbody></table></div>{!sales.length && <p>Sin ventas para estos filtros.</p>}<small>Hasta 100 tickets recientes de la fecha. Exportación de los resultados visibles.</small></section>
    <section className={styles.panel}><h2>Saldos pendientes de caja</h2>{data.receivables.map(sale => <div key={sale.id} className={styles.row}><span>#{sale.number} · {sale.customerName} · {sol(sale.dueCents)}</span><button disabled={disabled || !data.session} onClick={() => open(sale, "collect")}>Cobrar saldo #{sale.number}</button></div>)}{!data.receivables.length && <p>No hay saldos pendientes.</p>}<small>Hasta 100 saldos de caja, del más antiguo al más reciente. Las deudas anteriores se conservan en la ficha del cliente.</small></section>
    <Dialog open={Boolean(selected)} onOpenChange={value => { if (!value) { setSelected(null); setPassword(""); } }}><DialogContent className="max-h-[90vh] overflow-y-auto border-white/20 bg-zinc-950 text-white"><DialogTitle>{operation === "void" ? "Anular venta" : "Cobrar saldo"} #{selected?.number}</DialogTitle><form className={styles.modalForm} onSubmit={event => { event.preventDefault(); void submit(); }}>{error && <p role="alert">{error}</p>}{operation === "void" ? <><p>Confirme la devolución al cliente. La anulación restituye stock y revierte los cobros en el registro. Las devoluciones bancarias se realizan con el proveedor.</p><label>Motivo de anulación<input required minLength={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} /></label><label>Contraseña de administrador<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label></> : <><p>Saldo a cobrar: {sol(selected?.dueCents ?? 0)}</p><PaymentFields payments={payments} setPayments={setPayments} tendered={tendered} setTendered={setTendered} /></>}<button className={styles.primary} disabled={disabled}>Confirmar {operation === "void" ? "anulación" : "cobro"}</button></form></DialogContent></Dialog>
  </>;
}
