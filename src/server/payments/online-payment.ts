import { PaymentMethod, PaymentStatus, Prisma, type OnlinePaymentAttempt } from "@prisma/client";
import axios from "axios";
import { z } from "zod";
import fs from "node:fs";
import prisma from "@/infrastructure/prisma/prisma";
import { buildSaleQuote } from "@/domain/sales/sale-policy";
import { renewalPeriod } from "@/domain/attendance/renewal-period";
import { resolveOnlinePlan } from "./online-plan";
import { confirmedCharge, confirmedDecline, culqiConfiguration, hashValue, requestFingerprint, type OnlinePaymentInput } from "./culqi-policy";

const storedPayloadSchema = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive(), lineTotal: z.number().nonnegative(), trackStock: z.boolean() })),
  plan: z.object({ name: z.string(), durationDays: z.number().int().positive() }).nullable(),
});
type StoredPayload = z.infer<typeof storedPayloadSchema>;
export class PaymentConflict extends Error {}

// Local fault injection calls the real sandbox first, then drops its response.
// It cannot run with live keys, on the original DB, or without an explicit file.
function dropSandboxResponse(id: string) {
  const filename = process.env.WOLF_CULQI_FAULT_FILE;
  if (!filename || process.env.WOLF_LOCAL_ONLY !== "1" || process.env.WOLF_ALLOW_CULQI_TEST !== "1" || culqiConfiguration().mode !== "test") return;
  const database = new URL(process.env.DATABASE_URL || "");
  if (database.pathname !== "/wolfgym_acceptance_20261006" || !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || !fs.existsSync(filename)) return;
  const fault = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (fault.attemptId !== id || fault.phase !== "drop-approved-response") return;
  fs.unlinkSync(filename);
  throw new Error("SANDBOX_RESPONSE_DROPPED");
}

export function paymentView(attempt: OnlinePaymentAttempt) {
  return {
    ok: attempt.state === "COMPLETED", attemptId: attempt.id, paymentId: attempt.paymentId,
    state: attempt.state, total: attempt.amountCents / 100, chargeId: attempt.chargeId,
    message: attempt.state === "COMPLETED" ? "Pago confirmado" : attempt.state === "FAILED" ? (attempt.lastErrorCode === "USER_CANCELLED" ? "Pago cancelado; no se completó la compra" : "Pago rechazado; no se completó la compra") : attempt.state === "REQUIRES_3DS" ? "Debes autenticar el pago con tu banco" : "Pago pendiente de confirmación. No vuelvas a pagar; consulta el estado de este intento.",
  };
}

async function lockedAttempt(transaction: Prisma.TransactionClient, id: string) {
  await transaction.$queryRaw`SELECT "id" FROM "OnlinePaymentAttempt" WHERE "id" = ${id} FOR UPDATE`;
  const attempt = await transaction.onlinePaymentAttempt.findUniqueOrThrow({ where: { id } });
  return { attempt, payload: storedPayloadSchema.parse(attempt.payload) };
}

export async function finalizePayment(id: string) {
  return prisma.$transaction(async transaction => {
    const { attempt, payload } = await lockedAttempt(transaction, id);
    if (attempt.state === "COMPLETED") return attempt;
    if (!attempt.chargeId || !["CHARGED", "REVIEW"].includes(attempt.state)) throw new PaymentConflict("No existe un cargo confirmado para conciliar");
    for (const line of payload.lines) await transaction.purchase.create({ data: { customerId: attempt.userId, productId: line.productId, purchase_quantity: line.quantity, purchase_total: line.lineTotal } });
    if (payload.plan) {
      // Serialize two different successful renewals of the same profile.
      await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${attempt.userId} FOR UPDATE`;
      const profile = await transaction.clientProfile.findUnique({ where: { user_id: attempt.userId } });
      const period = renewalPeriod(payload.plan.durationDays, profile?.profile_start_date?.toISOString(), profile?.profile_end_date?.toISOString());
      const user = await transaction.user.findUniqueOrThrow({ where: { id: attempt.userId }, select: { firstName: true, lastName: true } });
      const dates = { profile_plan: payload.plan.name, profile_start_date: new Date(period.startDate + "T12:00:00Z"), profile_end_date: new Date(period.endDate + "T23:59:59Z") };
      await transaction.clientProfile.upsert({ where: { user_id: attempt.userId }, update: dates, create: { ...dates, user_id: attempt.userId, profile_first_name: user.firstName, profile_last_name: user.lastName } });
    }
    await transaction.paymentRecord.update({ where: { payment_id: attempt.paymentId }, data: { payment_status: PaymentStatus.COMPLETED, externalRef: attempt.chargeId } });
    return transaction.onlinePaymentAttempt.update({ where: { id }, data: { state: "COMPLETED", lastErrorCode: null } });
  });
}

async function rejectPayment(id: string, code: string) {
  return prisma.$transaction(async transaction => {
    const { attempt, payload } = await lockedAttempt(transaction, id);
    if (attempt.state === "FAILED") return attempt;
    if (attempt.chargeId || attempt.state !== "DISPATCHING") throw new PaymentConflict("Un cargo incierto debe conciliarse");
    for (const line of payload.lines.filter(line => line.trackStock)) await transaction.inventoryItem.update({ where: { item_id: line.productId }, data: { item_stock: { increment: line.quantity } } });
    await transaction.paymentRecord.update({ where: { payment_id: attempt.paymentId }, data: { payment_status: PaymentStatus.FAILED } });
    return transaction.onlinePaymentAttempt.update({ where: { id }, data: { state: "FAILED", lastErrorCode: code } });
  });
}

export async function cancelUnchargedPayment(userId: string, key: string) {
  return prisma.$transaction(async transaction => {
    const { attempt, payload } = await lockedAttempt(transaction, hashValue(userId + ":" + key));
    if (attempt.userId !== userId) throw new PaymentConflict("Intento no encontrado");
    if (attempt.state === "FAILED" && attempt.lastErrorCode === "USER_CANCELLED") return attempt;
    if (attempt.chargeId || !["RESERVED", "REQUIRES_3DS"].includes(attempt.state)) throw new PaymentConflict("Este pago ya se envió o requiere conciliación. Consulta su estado");
    for (const line of payload.lines.filter(line => line.trackStock)) await transaction.inventoryItem.update({ where: { item_id: line.productId }, data: { item_stock: { increment: line.quantity } } });
    await transaction.paymentRecord.update({ where: { payment_id: attempt.paymentId }, data: { payment_status: PaymentStatus.FAILED } });
    return transaction.onlinePaymentAttempt.update({ where: { id: attempt.id }, data: { state: "FAILED", lastErrorCode: "USER_CANCELLED" } });
  });
}

async function createAttempt(id: string, userId: string, input: OnlinePaymentInput, mode: string) {
  const requestHash = requestFingerprint(input, mode);
  const existing = await prisma.onlinePaymentAttempt.findUnique({ where: { id } });
  if (existing) {
    if (existing.userId !== userId || existing.requestHash !== requestHash) throw new PaymentConflict("El intento ya existe con otros datos");
    return existing;
  }
  try {
    return await prisma.$transaction(async transaction => {
      let amountCents: number;
      const payload: StoredPayload = { lines: [], plan: null };
      if (input.planId) {
        const plan = await resolveOnlinePlan(transaction, input.planId);
        if (!plan || !Number.isFinite(plan.price) || plan.price <= 0) throw new PaymentConflict("El plan no está disponible");
        amountCents = Math.round(plan.price * 100);
        payload.plan = { name: plan.name, durationDays: plan.durationDays };
      } else {
        const products = await transaction.inventoryItem.findMany({ where: { item_id: { in: input.items!.map(item => item.productId) }, is_admin_only: false } });
        const quote = buildSaleQuote(products.map(product => ({ id: product.item_id, name: product.item_name, price: product.item_price, discountPercent: product.item_discount, stock: product.track_stock ? product.item_stock : Number.MAX_SAFE_INTEGER })), input.items!);
        if (!quote.ok) throw new PaymentConflict("Productos no disponibles o stock insuficiente");
        amountCents = Math.round(quote.grandTotal * 100);
        for (const line of [...quote.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const trackStock = products.find(product => product.item_id === line.productId)!.track_stock;
          if (trackStock) {
            const reserved = await transaction.inventoryItem.updateMany({ where: { item_id: line.productId, is_admin_only: false, item_stock: { gte: line.quantity } }, data: { item_stock: { decrement: line.quantity } } });
            if (reserved.count !== 1) throw new PaymentConflict("El stock cambió; no se ha realizado el cobro");
          }
          payload.lines.push({ productId: line.productId, quantity: line.quantity, lineTotal: line.lineTotal, trackStock });
        }
      }
      if (amountCents < 300 || amountCents > 999900) throw new PaymentConflict("El total permitido es de S/3 a S/9.999");
      if (input.token.startsWith("ype_") && amountCents > 200000) throw new PaymentConflict("Yape permite pagos de hasta S/2.000");
      if (input.expectedAmountCents != null && input.expectedAmountCents !== amountCents) throw new PaymentConflict("El precio cambió. Revisa el total antes de confirmar el pago");
      const yape = input.token.startsWith("ype_");
      const payment = await transaction.paymentRecord.create({ data: { payer_user_id: userId, payment_amount: amountCents / 100, currency: "PEN", payment_status: PaymentStatus.PENDING, payment_method: yape ? PaymentMethod.TRANSFER : PaymentMethod.CARD, tenderMethod: yape ? "YAPE" : "CARD", note: payload.plan ? `Membresía: ${payload.plan.name}` : "Compra online" } });
      return transaction.onlinePaymentAttempt.create({ data: { id, userId, requestHash, sourceHash: hashValue(input.token), gatewayMode: mode, amountCents, payload, paymentId: payment.payment_id } });
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await prisma.onlinePaymentAttempt.findUnique({ where: { id } });
    if (!winner || winner.userId !== userId || winner.requestHash !== requestHash) throw new PaymentConflict("El token o intento ya se utilizó para otro pago");
    return winner;
  }
}

export async function submitOnlinePayment(userId: string, key: string, input: OnlinePaymentInput) {
  const config = culqiConfiguration();
  if (!config.enabled || !config.mode || (input.planId && !config.membershipsEnabled)) throw new PaymentConflict("Los pagos online no están habilitados");
  if (!["tkn", "ype"].some(kind => input.token.startsWith(`${kind}_${config.mode}_`))) throw new PaymentConflict("El token no corresponde al entorno de pago");
  const id = hashValue(userId + ":" + key);
  if (input.authentication3DS && !(await prisma.onlinePaymentAttempt.findUnique({ where: { id } }))) throw new PaymentConflict("No existe un intento pendiente de autenticación");
  let attempt = await createAttempt(id, userId, input, config.mode);
  if (attempt.state === "CHARGED") {
    try { return await finalizePayment(id); } catch { return attempt; }
  }
  const authenticated = Boolean(input.authentication3DS);
  if (authenticated && attempt.state !== "REQUIRES_3DS") return attempt;
  if (!authenticated && attempt.state !== "RESERVED") return attempt;
  const claim = await prisma.onlinePaymentAttempt.updateMany({
    where: { id, state: authenticated ? "REQUIRES_3DS" : "RESERVED" },
    data: { state: "DISPATCHING", ...(authenticated ? { authenticationHash: hashValue(JSON.stringify(input.authentication3DS)) } : {}) },
  });
  if (claim.count !== 1) return prisma.onlinePaymentAttempt.findUniqueOrThrow({ where: { id } });
  try {
    const response = await axios.post("https://api.culqi.com/v2/charges", {
      amount: attempt.amountCents, currency_code: "PEN", email: input.email, source_id: input.token,
      capture: true, installments: 0, description: "Wolf Gym", metadata: { wolf_attempt_id: id },
      ...(input.deviceFingerprintId ? { antifraud_details: { device_finger_print_id: input.deviceFingerprintId } } : {}),
      ...(input.authentication3DS ? { authentication_3DS: input.authentication3DS } : {}),
    }, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CULQI_PRIVATE_KEY}` }, timeout: 20000, validateStatus: () => true });
    const charge = confirmedCharge(response.data, attempt);
    if (charge && response.status >= 200 && response.status < 300) {
      dropSandboxResponse(id);
      attempt = await prisma.onlinePaymentAttempt.update({ where: { id }, data: { state: "CHARGED", chargeId: charge.id, lastErrorCode: null } });
      try { return await finalizePayment(id); } catch {
        console.warn("Online payment awaits finalization", { attemptId: id });
        return attempt;
      }
    }
    if (response.status >= 200 && response.status < 300 && response.data?.action_code === "REVIEW" && !authenticated) {
      return prisma.onlinePaymentAttempt.update({ where: { id }, data: { state: "REQUIRES_3DS" } });
    }
    // Only a structured, definitive provider rejection releases stock. Timeouts,
    // 5xx, throttling and malformed success responses retain the reservation.
    const errorType = response.data?.object === "error" ? response.data.type : null;
    if (["card_error", "parameter_error", "authentication_error", "operacion_denegada"].includes(errorType) && response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) return rejectPayment(id, "PROVIDER_REJECTED");
    return prisma.onlinePaymentAttempt.update({ where: { id }, data: { state: "REVIEW", lastErrorCode: "UNKNOWN_PROVIDER_OUTCOME" } });
  } catch {
    // A crash or failed DB write after dispatch is also an unknown outcome.
    console.warn("Online payment outcome requires reconciliation", { attemptId: id });
    return prisma.onlinePaymentAttempt.update({ where: { id }, data: { state: "REVIEW", lastErrorCode: "UNKNOWN_PROVIDER_OUTCOME" } });
  }
}

export async function reconcileOnlinePayment(id: string, chargeId?: string) {
  const attempt = await prisma.onlinePaymentAttempt.findUniqueOrThrow({ where: { id } });
  if (["COMPLETED", "FAILED"].includes(attempt.state)) return attempt;
  const config = culqiConfiguration();
  if (!config.enabled || config.mode !== attempt.gatewayMode) throw new PaymentConflict("Entorno de conciliación incompatible");
  const reference = attempt.chargeId || chargeId;
  if (!reference || !reference.startsWith(`chr_${attempt.gatewayMode}_`)) throw new PaymentConflict("Indica la referencia del cargo en Culqi; no se realizará otro cobro");
  const response = await axios.get(`https://api.culqi.com/v2/charges/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.CULQI_PRIVATE_KEY}` }, timeout: 15000, validateStatus: () => true });
  const charge = confirmedCharge(response.data, attempt);
  const decline = confirmedDecline(response.data, attempt);
  if (response.status === 200 && decline) {
    return prisma.$transaction(async transaction => {
      const { attempt: current, payload } = await lockedAttempt(transaction, id);
      if (current.state === "FAILED") return current;
      if (current.chargeId || !["REVIEW", "DISPATCHING"].includes(current.state)) throw new PaymentConflict("El estado del intento requiere otra comprobación; la reserva se conserva");
      for (const line of payload.lines.filter(line => line.trackStock)) await transaction.inventoryItem.update({ where: { item_id: line.productId }, data: { item_stock: { increment: line.quantity } } });
      await transaction.paymentRecord.update({ where: { payment_id: current.paymentId }, data: { payment_status: PaymentStatus.FAILED, externalRef: decline.id } });
      return transaction.onlinePaymentAttempt.update({ where: { id }, data: { state: "FAILED", lastErrorCode: "PROVIDER_REJECTED_RECONCILED" } });
    });
  }
  if (!charge || response.status !== 200) throw new PaymentConflict("No se pudo verificar el cargo, importe y referencia del intento");
  await prisma.$transaction(async transaction => {
    const { attempt: current } = await lockedAttempt(transaction, id);
    if (["FAILED", "RESERVED", "REQUIRES_3DS"].includes(current.state)) throw new PaymentConflict("El intento no está pendiente de conciliación");
    if (current.state !== "COMPLETED") await transaction.onlinePaymentAttempt.update({ where: { id }, data: { chargeId: charge.id, state: "CHARGED" } });
  });
  return finalizePayment(id);
}
