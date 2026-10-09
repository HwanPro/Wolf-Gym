import { z } from "zod";

export const money = z.number().finite().min(0).max(999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Use como máximo dos decimales");
export const cents = (value: number) => Math.round(value * 100);
export const methodSchema = z.enum(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"]);
const id = z.string().trim().min(1).max(100);
const note = z.string().trim().max(500).default("");
export const quoteSchema = z.object({
  items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(1000) }).strict()).min(1).max(50),
  discountPercent: z.number().finite().min(0).max(100).default(0),
}).strict();
export const paymentSchema = z.object({ method: methodSchema, amount: money.refine(value => value > 0), reference: z.string().trim().max(100).default("") }).strict();
export const saleSchema = quoteSchema.extend({ sessionId: id, customerId: id.optional(), expectedTotal: money, note, payments: z.array(paymentSchema).max(8), cashTendered: money.default(0) }).strict();
export const openSchema = z.object({ openingAmount: money, note }).strict();
export const closeSchema = z.object({ sessionId: id, countedAmount: money, note }).strict();
export const movementSchema = z.object({ sessionId: id, kind: z.enum(["IN", "OUT"]), amount: money.refine(value => value > 0), reason: z.string().trim().min(3).max(300) }).strict();
export const collectionSchema = z.object({ saleId: id, sessionId: id, payments: z.array(paymentSchema).min(1).max(8), cashTendered: money.default(0) }).strict();
export const voidSchema = z.object({ saleId: id, reason: z.string().trim().min(3).max(300) }).strict();
export type CatalogItem = { item_id: string; item_name: string; item_price: number; item_discount: number | null; item_stock: number; track_stock: boolean };
export class CashError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) { super(message); }
}
export function cashQuote(products: CatalogItem[], input: z.infer<typeof quoteSchema>) {
  const grouped = new Map<string, number>();
  for (const item of input.items) grouped.set(item.productId, (grouped.get(item.productId) ?? 0) + item.quantity);
  const lines = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([productId, quantity]) => {
    const product = products.find(row => row.item_id === productId);
    if (!product) throw new CashError("Producto inexistente", 404);
    if (quantity > 1000 || (product.track_stock && product.item_stock < quantity)) throw new CashError(`Stock insuficiente: ${product.item_name}`, 409);
    const discount = product.item_discount ?? 0;
    if (!Number.isFinite(product.item_price) || product.item_price < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) throw new CashError("Precio inválido en catálogo", 409);
    const unitCents = Math.round(product.item_price * (1 - discount / 100) * 100);
    const baseCents = unitCents * quantity;
    const totalCents = Math.round(baseCents * (1 - input.discountPercent / 100));
    return { productId, productName: product.item_name, quantity, unitCents, totalCents, baseCents, stockTracked: product.track_stock };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.baseCents, 0);
  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  if (totalCents > 99999999) throw new CashError("Importe fuera del límite de caja");
  return { lines, subtotalCents, discountCents: subtotalCents - totalCents, totalCents };
}
export function paymentTotals(payments: z.infer<typeof paymentSchema>[], totalCents: number, cashTendered: number) {
  const paidCents = payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const cashCents = payments.filter(payment => payment.method === "CASH").reduce((sum, payment) => sum + cents(payment.amount), 0);
  const tenderedCents = cents(cashTendered);
  if (paidCents > totalCents) throw new CashError("Los pagos exceden el saldo");
  if (cashCents > tenderedCents || (cashCents === 0 && tenderedCents !== 0)) throw new CashError("Revise el efectivo recibido");
  return { paidCents, dueCents: totalCents - paidCents, cashCents, tenderedCents, changeCents: tenderedCents - cashCents };
}
