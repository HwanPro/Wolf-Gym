"use client";
import { useState } from "react";
import { CashAction, CashData, sol } from "./types";
import styles from "./cash.module.css";
export function SessionPanel({ data, act, disabled }: { data: CashData; act: CashAction; disabled: boolean }) {
  const [opening, setOpening] = useState("0"), [amount, setAmount] = useState(""), [counted, setCounted] = useState("");
  const [reason, setReason] = useState(""), [closingNote, setClosingNote] = useState("");
  const [kind, setKind] = useState("IN"), [error, setError] = useState("");
  const run = async (action: string, body: unknown) => { try { setError(""); await act(action, body); setAmount(""); setReason(""); setCounted(""); setClosingNote(""); } catch (error) { setError(error instanceof Error ? error.message : "Error de caja"); } };
  const session = data.session;
  return <section className={styles.panel}><div className={styles.row}><h2>{session ? "Caja abierta" : "Abrir caja"}</h2>{session && <strong>Efectivo esperado: {sol(session.expectedCents)}</strong>}</div>{error && <p role="alert" className={styles.error}>{error}</p>}
    {!session ? <form className={styles.formRow} onSubmit={event => { event.preventDefault(); void run("open", { openingAmount: Number(opening), note: "Apertura de turno" }); }}><label>Fondo inicial (S/)<input type="number" min="0" max="999999.99" step="0.01" required value={opening} onChange={event => setOpening(event.target.value)} /></label><button className={styles.primary} disabled={disabled}>Abrir turno</button></form> : <>
      <p>Abierta {new Date(session.openedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} · Fondo {sol(session.openingCents)}</p>
      <details><summary>Ingreso / retiro de efectivo</summary><form className={styles.formRow} onSubmit={event => { event.preventDefault(); void run("movement", { sessionId: session.id, kind, amount: Number(amount), reason }); }}><label>Movimiento<select value={kind} onChange={event => setKind(event.target.value)}><option value="IN">Ingreso</option><option value="OUT">Retiro</option></select></label><label>Monto (S/)<input type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label><label>Motivo<input required minLength={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} /></label><button disabled={disabled}>Registrar movimiento</button></form></details>
      <details><summary>Cerrar turno y arquear efectivo</summary><form className={styles.formRow} onSubmit={event => { event.preventDefault(); void run("close", { sessionId: session.id, countedAmount: Number(counted), note: closingNote }); }}><label>Efectivo contado (S/)<input type="number" min="0" step="0.01" required value={counted} onChange={event => setCounted(event.target.value)} /></label><label>Observación de arqueo<input maxLength={500} required={counted !== "" && Math.round(Number(counted) * 100) !== session.expectedCents} minLength={3} value={closingNote} onChange={event => setClosingNote(event.target.value)} /></label><span>Diferencia: {sol(Math.round(Number(counted || 0) * 100) - session.expectedCents)}</span><button disabled={disabled}>Cerrar caja</button></form><p>El cierre conserva ventas, cobros y deudas pendientes.</p></details>
      <details><summary>Movimientos recientes</summary>{session.movements?.map(movement => <p key={movement.id}>{new Date(movement.createdAt).toLocaleTimeString("es-PE", { timeZone: "America/Lima" })} · {movement.reason} · {sol(movement.amountCents)}</p>)}</details>
    </>}
    <details><summary>Historial de turnos</summary>{data.sessions.map(row => <p key={row.id}>{new Date(row.openedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} · {row.status === "OPEN" ? "Abierto" : "Cerrado"} · Fondo {sol(row.openingCents)}{row.closedAt && ` · Esperado ${sol(row.expectedCents)} · Contado ${sol(row.countedCents ?? 0)} · Diferencia ${sol(row.differenceCents ?? 0)}`}</p>)}</details>
  </section>;
}
