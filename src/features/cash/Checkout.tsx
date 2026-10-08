"use client";
import { useEffect, useMemo, useState } from "react";
import { CashAction, CashData, Tender, sol } from "./types";
import { PaymentFields } from "./PaymentFields";
import styles from "./cash.module.css";
type Quote = { totalCents: number; subtotalCents: number; discountCents: number; lines: { productId: string; productName: string; quantity: number; totalCents: number }[] };
export function Checkout({ data, act, disabled }: { data: CashData; act: CashAction; disabled: boolean }) {
  const [search, setSearch] = useState(""), [category, setCategory] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0"), [note, setNote] = useState("");
  const [payments, setPayments] = useState<Tender[]>([]), [tendered, setTendered] = useState("");
  const [credit, setCredit] = useState(false), [review, setReview] = useState<Quote | null>(null);
  const [error, setError] = useState(""), [quoting, setQuoting] = useState(false);
  const signature = JSON.stringify({ items, customerId, discount, note, payments, tendered, credit });
  useEffect(() => { setReview(null); }, [signature]);
  const categories = [...new Set(data.products.map(row => row.item_category || "general"))];
  const products = data.products.filter(row => (!category || (row.item_category || "general") === category) && `${row.item_name} ${row.item_sku || ""}`.toLowerCase().includes(search.toLowerCase()));
  const provisional = useMemo(() => items.reduce((sum, line) => {
    const product = data.products.find(row => row.item_id === line.productId);
    if (!product) return sum;
    const unit = Math.round(product.item_price * 100 * (1 - (product.item_discount ?? 0) / 100));
    return sum + Math.round(unit * line.quantity * (1 - Number(discount) / 100));
  }, 0), [items, data.products, discount]);
  const paid = payments.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const cash = payments.filter(row => row.method === "CASH").reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const add = (productId: string) => { setItems(rows => rows.some(row => row.productId === productId) ? rows.map(row => row.productId === productId ? { ...row, quantity: row.quantity + 1 } : row) : [...rows, { productId, quantity: 1 }]); };
  const submit = async () => {
    if (!data.session) return setError("Abra un turno antes de vender");
    if (!items.length) return setError("Añada productos a la venta");
    if (!credit && paid !== provisional) return setError("Complete el pago total o habilite crédito");
    if (credit && !customerId) return setError("Seleccione un cliente para registrar crédito");
    try {
      setError("");
      if (!review) {
        setQuoting(true);
        const response = await fetch("/api/admin/cash/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, discountPercent: Number(discount) }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setReview(result.result); return;
      }
      if (!credit && paid !== review.totalCents) throw new Error("Ajuste el pago al total actualizado");
      await act("sale", { sessionId: data.session.id, items, customerId: customerId || undefined, expectedTotal: review.totalCents / 100, discountPercent: Number(discount), note, payments, cashTendered: cash ? Number(tendered) : 0 });
      setItems([]); setPayments([]); setReview(null); setNote(""); setDiscount("0"); setTendered(""); setCredit(false);
    } catch (error) { setReview(null); setError(error instanceof Error ? error.message : "No se pudo confirmar la venta"); } finally { setQuoting(false); }
  };
  return <section className={styles.checkout}>
    <div className={styles.panel}><div className={styles.row}><h2>Catálogo</h2><span className={styles.muted}>{data.products.length} productos / servicios</span></div><div className={styles.formRow}><label>Buscar nombre o SKU<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar en inventario" /></label><label>Categoría<select aria-label="Categoría" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label></div><div className={styles.catalog}>{products.map(product => <button type="button" className={styles.product} key={product.item_id} disabled={disabled || !data.session || (product.track_stock && product.item_stock <= 0)} onClick={() => add(product.item_id)}><span className={styles.muted}>{product.item_category || "general"}</span><strong>{product.item_name}</strong><b>{sol(Math.round(product.item_price * 100 * (1 - (product.item_discount ?? 0) / 100)))}</b><small>{product.track_stock ? `Stock: ${product.item_stock}` : "Servicio · sin límite de stock"}{product.item_sku ? ` · ${product.item_sku}` : ""}</small></button>)}</div>{!products.length && <p>Sin resultados. Cree o edite productos en Administrar catálogo.</p>}</div>
    <form className={styles.panel} onSubmit={event => { event.preventDefault(); void submit(); }}><div className={styles.row}><h2>Nueva venta</h2><button type="button" disabled={disabled} onClick={() => { setItems([]); setPayments([]); }}>Vaciar</button></div>{error && <p role="alert" className={styles.error}>{error}</p>}
      <label>Cliente<select value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Venta mostrador</option>{data.clients.map(client => <option key={client.id} value={client.id}>{`${client.firstName} ${client.lastName}`.trim()} · {client.username}</option>)}</select></label>
      {!items.length && <p className={styles.empty}>Seleccione productos del catálogo.</p>}
      {items.map(line => { const product = data.products.find(row => row.item_id === line.productId); return <div className={styles.cartLine} key={line.productId}><strong>{product?.item_name ?? "Producto retirado del catálogo"}</strong><label>Cantidad<input type="number" min="1" max="1000" required value={line.quantity || ""} onChange={event => setItems(rows => rows.map(row => row.productId === line.productId ? { ...row, quantity: Number(event.target.value) } : row))} /></label><button type="button" aria-label={`Quitar ${product?.item_name}`} onClick={() => setItems(rows => rows.filter(row => row.productId !== line.productId))}>Quitar</button></div>; })}
      <div className={styles.formRow}><label>Descuento adicional (%)<input type="number" min="0" max="100" step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} /></label><label>Nota / motivo de descuento<input maxLength={500} minLength={Number(discount) > 0 ? 3 : undefined} required={Number(discount) > 0} value={note} onChange={event => setNote(event.target.value)} /></label></div>
      <div className={styles.total}><span>Total {review ? "verificado" : "estimado"}</span><strong>{sol(review?.totalCents ?? provisional)}</strong></div><button type="button" disabled={disabled || !items.length} onClick={() => { setPayments(provisional > 0 ? [{ method: "CASH", amount: provisional / 100, reference: "" }] : []); setTendered(provisional > 0 ? String(provisional / 100) : ""); }}>Efectivo exacto</button>
      <PaymentFields payments={payments} setPayments={setPayments} tendered={tendered} setTendered={setTendered} />
      <label className={styles.checkbox}><input type="checkbox" checked={credit} onChange={event => setCredit(event.target.checked)} /> Permitir saldo pendiente para el cliente</label><p>Cobrado: {sol(paid)} · Pendiente: {sol((review?.totalCents ?? provisional) - paid)} · Vuelto: {sol(cash ? Math.round(Number(tendered || 0) * 100) - cash : 0)}</p>
      {review && <div className={styles.warning} role="status"><strong>Revise antes de confirmar</strong>{review.lines.map(line => <p key={line.productId}>{line.quantity} × {line.productName}: {sol(line.totalCents)}</p>)}<p>Descuento adicional: {sol(review.discountCents)}</p><p>La confirmación registra cobros y descuenta stock.</p></div>}
      <button className={styles.primary} disabled={disabled || quoting || !data.session || !items.length}>{quoting ? "Verificando…" : review ? "Confirmar venta" : "Revisar venta"}</button>
    </form>
  </section>;
}
