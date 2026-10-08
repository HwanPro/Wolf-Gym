import { createHash } from "node:crypto";
import { z } from "zod";

export const authentication3DSSchema = z.object({
  eci: z.string().min(1).max(10),
  xid: z.string().min(1).max(200),
  cavv: z.string().min(1).max(200),
  protocolVersion: z.string().min(1).max(20),
  directoryServerTransactionId: z.string().min(1).max(100).optional(),
});
export const onlinePaymentSchema = z.object({
  token: z.string().regex(/^(tkn|ype)_(test|live)_[A-Za-z0-9]+$/).max(200),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  items: z.array(z.object({ productId: z.string().trim().min(1).max(120), quantity: z.number().int().positive().max(100) })).min(1).max(50).optional(),
  planId: z.string().trim().min(1).max(120).optional(),
  deviceFingerprintId: z.string().min(1).max(200).optional(),
  expectedAmountCents: z.number().int().min(300).max(999900).optional(),
  authentication3DS: authentication3DSSchema.optional(),
}).refine(value => Boolean(value.items) !== Boolean(value.planId), { message: "Selecciona productos o una membresía" });
export type OnlinePaymentInput = z.infer<typeof onlinePaymentSchema>;
export const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");

export function requestFingerprint(input: OnlinePaymentInput, mode: string) {
  const quantities = new Map<string, number>();
  for (const item of input.items || []) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  return hashValue(JSON.stringify({
    mode, source: hashValue(input.token), email: input.email, planId: input.planId || null,
    items: [...quantities].sort(([a], [b]) => a.localeCompare(b)),
    deviceFingerprintId: input.deviceFingerprintId || null,
    expectedAmountCents: input.expectedAmountCents || null,
  }));
}

export function culqiConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const privateKey = env.CULQI_PRIVATE_KEY || "";
  const publicKey = env.CULQI_PUBLIC_KEY || env.NEXT_PUBLIC_CULQI_PUBLIC_KEY || "";
  const privateMode = privateKey.match(/^sk_(test|live)_[A-Za-z0-9]+$/)?.[1];
  const publicMode = publicKey.match(/^pk_(test|live)_[A-Za-z0-9]+$/)?.[1];
  const configured = Boolean(privateMode && privateMode === publicMode);
  const localSandbox = env.WOLF_LOCAL_ONLY === "1" && privateMode === "test" && env.WOLF_ALLOW_CULQI_TEST === "1";
  const enabled = configured && env.WOLF_ENABLE_ONLINE_PAYMENTS === "1" && (env.WOLF_DISABLE_EXTERNAL_WRITES !== "1" || localSandbox);
  return { configured, enabled, mode: configured ? privateMode! : null, publicKey: configured ? publicKey : null, membershipsEnabled: enabled && env.WOLF_ENABLE_ONLINE_MEMBERSHIPS === "1" };
}

export const confirmedChargeSchema = z.object({
  object: z.literal("charge"), id: z.string().regex(/^chr_(test|live)_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(), currency_code: z.literal("PEN").optional(), currency: z.literal("PEN").optional(),
  capture: z.literal(true),
  // `paid` is not the authorization result. Culqi's current successful charge
  // example has paid=false; confirm the documented authorization outcome.
  outcome: z.object({ code: z.enum(["AUT0000", "succesfull_charge"]) }),
  metadata: z.object({ wolf_attempt_id: z.string() }).passthrough(),
});

const confirmedDeclineSchema = confirmedChargeSchema.extend({
  capture: z.boolean(),
  outcome: z.object({
    type: z.enum(["operacion_denegada", "card_error"]),
    code: z.string().min(1).refine(code => !["AUT0000", "succesfull_charge"].includes(code)),
    decline_code: z.enum(["insufficient_funds", "expired_card", "stolen_card", "lost_card", "contact_issuer", "invalid_cvv", "incorrect_cvv", "too_many_attempts_cvv", "issuer_decline_operation", "invalid_card", "fraudulent"]),
  }),
});

export function confirmedDecline(body: unknown, expected: { id: string; amountCents: number; gatewayMode: string }) {
  const parsed = confirmedDeclineSchema.safeParse(body);
  if (!parsed.success || !(parsed.data.currency_code || parsed.data.currency)) return null;
  const charge = parsed.data;
  return charge.amount === expected.amountCents && charge.id.startsWith(`chr_${expected.gatewayMode}_`) && charge.metadata.wolf_attempt_id === expected.id ? charge : null;
}

export function confirmedCharge(body: unknown, expected: { id: string; amountCents: number; gatewayMode: string }) {
  const parsed = confirmedChargeSchema.safeParse(body);
  if (!parsed.success || !(parsed.data.currency_code || parsed.data.currency)) return null;
  const charge = parsed.data;
  return charge.amount === expected.amountCents && charge.id.startsWith(`chr_${expected.gatewayMode}_`) && charge.metadata.wolf_attempt_id === expected.id ? charge : null;
}
