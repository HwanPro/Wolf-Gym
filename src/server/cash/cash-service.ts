import { createHash } from "node:crypto";
import { Prisma, PaymentMethod } from "@prisma/client";
import prisma from "@/infrastructure/prisma/prisma";
import { cashQuote, cents, CashError, paymentTotals, quoteSchema, saleSchema, openSchema, closeSchema, movementSchema, collectionSchema, voidSchema, paymentSchema } from "@/domain/cash/cash-policy";
import { z } from "zod";

type Tx = Prisma.TransactionClient;
export const saleInclude = { lines: true, payments: true } satisfies Prisma.CashSaleInclude;
export async function quote(tx: Tx, input: z.infer<typeof quoteSchema>, lock = false) {
  if (lock) await tx.$queryRaw(Prisma.sql`SELECT item_id FROM "InventoryItem" WHERE item_id IN (${Prisma.join(input.items.map(item => item.productId))}) ORDER BY item_id FOR UPDATE`);
  const products = await tx.inventoryItem.findMany({ where: { item_id: { in: input.items.map(item => item.productId) } } });
  return cashQuote(products, input);
}
export async function expectedCash(tx: Tx, sessionId: string) {
  const session = await tx.cashSession.findUniqueOrThrow({ where: { id: sessionId } });
  const movements = await tx.cashMovement.aggregate({ where: { sessionId }, _sum: { amountCents: true } });
  return session.openingCents + (movements._sum.amountCents ?? 0);
}
async function activeSession(tx: Tx, id: string) {
  const session = await tx.cashSession.findUnique({ where: { id } });
  if (!session || session.status !== "OPEN") throw new CashError("Abra una caja vigente para esta acción", 409);
  return session;
}
export async function executeCashAction(actorId: string, kind: string, key: string | null, input: unknown) {
  if (!key || !z.string().uuid().safeParse(key).success) throw new CashError("Se requiere Idempotency-Key UUID");
  const schemas = { open: openSchema, close: closeSchema, movement: movementSchema, sale: saleSchema, collect: collectionSchema, void: voidSchema };
  if (!(kind in schemas)) throw new CashError("Acción desconocida", 404);
  const body = schemas[kind as keyof typeof schemas].parse(input);
  const requestKey = `${actorId}:${kind}:${key}`;
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return prisma.$transaction(async tx => {
    // One transaction lock shared by all cashier operations, including retries and closing.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('wolf-cash-main'))`;
    const existing = await tx.cashAction.findUnique({ where: { requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new CashError("La clave ya pertenece a otra operación", 409);
      return existing.result;
    }
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "admin") throw new CashError("No autorizado", 403);
    let result: unknown;
    switch (kind) {
      case "open": {
        const value = openSchema.parse(body);
        if (await tx.cashSession.findFirst({ where: { registerId: "main", status: "OPEN" } })) throw new CashError("La caja ya está abierta", 409);
        result = await tx.cashSession.create({ data: { openedBy: actorId, openingCents: cents(value.openingAmount), openingNote: value.note } });
        break;
      }
      case "close": {
        const value = closeSchema.parse(body);
        await activeSession(tx, value.sessionId);
        const expectedCents = await expectedCash(tx, value.sessionId);
        const countedCents = cents(value.countedAmount);
        if (expectedCents !== countedCents && value.note.length < 3) throw new CashError("Explique la diferencia de arqueo");
        result = await tx.cashSession.update({ where: { id: value.sessionId }, data: { status: "CLOSED", closedAt: new Date(), closedBy: actorId, expectedCents, countedCents, differenceCents: countedCents - expectedCents, closingNote: value.note } });
        break;
      }
      case "movement": {
        const value = movementSchema.parse(body);
        await activeSession(tx, value.sessionId);
        const amountCents = cents(value.amount) * (value.kind === "OUT" ? -1 : 1);
        const balance = await expectedCash(tx, value.sessionId) + amountCents;
        if (balance < 0) throw new CashError("Efectivo insuficiente en caja", 409);
        if (balance > 99999999) throw new CashError("El saldo excede el límite de caja", 409);
        result = await tx.cashMovement.create({ data: { sessionId: value.sessionId, kind: value.kind, amountCents, reason: value.reason, createdBy: actorId } });
        break;
      }
      case "sale": result = await createSale(tx, actorId, saleSchema.parse(body)); break;
      case "collect": result = await collectSale(tx, actorId, collectionSchema.parse(body)); break;
      case "void": result = await voidSale(tx, actorId, voidSchema.parse(body)); break;
    }
    const json = JSON.parse(JSON.stringify({ ok: true, result })) as Prisma.InputJsonValue;
    await tx.cashAction.create({ data: { actorId, kind, requestKey, requestHash, result: json } });
    return json;
  }, { maxWait: 15000, timeout: 20000 });
}

function legacyMethod(method: string): PaymentMethod {
  if (method === "CASH" || method === "CARD" || method === "TRANSFER") return method;
  return method === "YAPE" || method === "PLIN" ? "TRANSFER" : "OTHER";
}
async function recordPayments(tx: Tx, sale: { id: string; customerId: string | null; cashierId: string }, sessionId: string, actorId: string, payments: z.infer<typeof paymentSchema>[]) {
  for (const payment of payments) {
    await tx.paymentRecord.create({ data: { payer_user_id: sale.customerId ?? sale.cashierId, payment_amount: payment.amount, payment_method: legacyMethod(payment.method), tenderMethod: payment.method, payment_status: "COMPLETED", externalRef: payment.reference || null, note: `Caja ${sale.id}`, cashSaleId: sale.id } });
  }
  const cashCents = payments.filter(payment => payment.method === "CASH").reduce((sum, row) => sum + cents(row.amount), 0);
  if (cashCents && await expectedCash(tx, sessionId) + cashCents > 99999999) throw new CashError("El saldo excede el límite de caja", 409);
  if (cashCents) await tx.cashMovement.create({ data: { sessionId, saleId: sale.id, kind: "SALE", amountCents: cashCents, reason: "Cobro de venta", createdBy: actorId } });
}
async function createSale(tx: Tx, actorId: string, input: z.infer<typeof saleSchema>) {
  await activeSession(tx, input.sessionId);
  const priced = await quote(tx, { items: input.items, discountPercent: input.discountPercent }, true);
  if (priced.totalCents !== cents(input.expectedTotal)) throw new CashError("El precio cambió. Revise la cotización actual", 409, priced);
  if (input.discountPercent > 0 && input.note.length < 3) throw new CashError("Indique el motivo del descuento");
  const totals = paymentTotals(input.payments, priced.totalCents, input.cashTendered);
  const customer = input.customerId ? await tx.user.findUnique({ where: { id: input.customerId }, select: { id: true, role: true, firstName: true, lastName: true, username: true, profile: { select: { profile_id: true } } } }) : null;
  if (input.customerId && (!customer || customer.role !== "client")) throw new CashError("Cliente inválido");
  if (totals.dueCents > 0 && !customer?.profile) throw new CashError("El crédito requiere un cliente con perfil");
  for (const line of priced.lines) {
    if (!line.stockTracked) continue;
    const changed = await tx.inventoryItem.updateMany({ where: { item_id: line.productId, item_stock: { gte: line.quantity } }, data: { item_stock: { decrement: line.quantity } } });
    if (changed.count !== 1) throw new CashError("Stock modificado durante la venta", 409);
  }
  const sale = await tx.cashSale.create({ data: {
    sessionId: input.sessionId, cashierId: actorId, customerId: customer?.id,
    customerName: customer ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || customer.username : "Venta mostrador",
    status: totals.dueCents ? "CREDIT" : "COMPLETED", subtotalCents: priced.subtotalCents, discountCents: priced.discountCents, discountPercent: input.discountPercent, totalCents: priced.totalCents,
    paidCents: totals.paidCents, dueCents: totals.dueCents, tenderedCents: totals.tenderedCents, changeCents: totals.changeCents, note: input.note,
    lines: { create: priced.lines.map(({ baseCents: _base, ...line }) => line) },
  } });
  for (const line of priced.lines) await tx.purchase.create({ data: { customerId: customer?.id ?? actorId, productId: line.productId, purchase_quantity: line.quantity, purchase_total: line.totalCents / 100, cashSaleId: sale.id } });
  await recordPayments(tx, sale, input.sessionId, actorId, input.payments);
  if (totals.dueCents && customer?.profile) await tx.dailyDebt.create({ data: { clientProfileId: customer.profile.profile_id, productType: "CUSTOM", productName: `Venta #${sale.number}`, amount: totals.dueCents / 100, quantity: 1, createdBy: actorId, cashSaleId: sale.id } });
  return tx.cashSale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
}
async function archiveDebt(tx: Tx, saleId: string, reason: string, actorId: string) {
  const debt = await tx.dailyDebt.findUnique({ where: { cashSaleId: saleId } });
  if (!debt) return;
  await tx.debtHistory.create({ data: { clientProfileId: debt.clientProfileId, productType: debt.productType, productName: debt.productName, amount: debt.amount, quantity: debt.quantity, debtType: reason, createdAt: debt.createdAt, createdBy: actorId, cashSaleId: saleId, productId: debt.productId } });
  await tx.dailyDebt.delete({ where: { id: debt.id } });
}
async function collectSale(tx: Tx, actorId: string, input: z.infer<typeof collectionSchema>) {
  await activeSession(tx, input.sessionId);
  const sale = await tx.cashSale.findUnique({ where: { id: input.saleId } });
  if (!sale || sale.status === "VOIDED" || sale.dueCents <= 0) throw new CashError("La venta no tiene saldo cobrable", 409);
  const totals = paymentTotals(input.payments, sale.dueCents, input.cashTendered);
  await recordPayments(tx, sale, input.sessionId, actorId, input.payments);
  await tx.cashSale.update({ where: { id: sale.id }, data: { paidCents: { increment: totals.paidCents }, dueCents: totals.dueCents, status: totals.dueCents ? "CREDIT" : "COMPLETED" } });
  if (totals.dueCents === 0) await archiveDebt(tx, sale.id, "paid", actorId);
  else await tx.dailyDebt.updateMany({ where: { cashSaleId: sale.id }, data: { amount: totals.dueCents / 100 } });
  return tx.cashSale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
}
async function voidSale(tx: Tx, actorId: string, input: z.infer<typeof voidSchema>) {
  const sale = await tx.cashSale.findUnique({ where: { id: input.saleId }, include: saleInclude });
  if (!sale || sale.status === "VOIDED") throw new CashError("Venta inexistente o ya anulada", 409);
  await activeSession(tx, sale.sessionId);
  const refundCents = sale.payments.filter(row => row.payment_status === "COMPLETED" && row.tenderMethod === "CASH").reduce((sum, row) => sum + cents(Number(row.payment_amount)), 0);
  if (await expectedCash(tx, sale.sessionId) < refundCents) throw new CashError("Efectivo insuficiente para devolver el cobro", 409);
  for (const line of sale.lines) if (line.stockTracked) await tx.inventoryItem.update({ where: { item_id: line.productId }, data: { item_stock: { increment: line.quantity } } });
  await tx.paymentRecord.updateMany({ where: { cashSaleId: sale.id, payment_status: "COMPLETED" }, data: { payment_status: "REFUNDED" } });
  if (refundCents) await tx.cashMovement.create({ data: { sessionId: sale.sessionId, saleId: sale.id, kind: "VOID", amountCents: -refundCents, reason: input.reason, createdBy: actorId } });
  await archiveDebt(tx, sale.id, "cancelled", actorId);
  return tx.cashSale.update({ where: { id: sale.id }, data: { status: "VOIDED", paidCents: 0, dueCents: 0, voidReason: input.reason, voidedAt: new Date(), voidedBy: actorId }, include: saleInclude });
}
