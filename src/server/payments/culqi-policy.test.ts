import { describe, expect, it } from "vitest";
import { confirmedCharge, confirmedDecline, culqiConfiguration, onlinePaymentSchema, requestFingerprint } from "./culqi-policy";

const input = { token: "tkn_test_TestOnly", email: "client@example.invalid", items: [{ productId: "product", quantity: 2 }] };
describe("Culqi payment boundary", () => {
  it("requires exactly one purchase kind and token mode", () => {
    expect(onlinePaymentSchema.safeParse(input).success).toBe(true);
    expect(onlinePaymentSchema.safeParse({ ...input, token: "ype_test_TestOnly" }).success).toBe(true);
    expect(onlinePaymentSchema.safeParse({ ...input, items: undefined, planId: "monthly" }).success).toBe(true);
    expect(onlinePaymentSchema.safeParse({ ...input, planId: "monthly" }).success).toBe(false);
    expect(onlinePaymentSchema.safeParse({ ...input, items: undefined }).success).toBe(false);
    expect(onlinePaymentSchema.safeParse({ ...input, token: "card-number" }).success).toBe(false);
  });
  it("binds retries to the same intent while normalizing duplicate lines", () => {
    const split = { ...input, items: [{ productId: "product", quantity: 1 }, { productId: "product", quantity: 1 }] };
    expect(requestFingerprint(input, "test")).toBe(requestFingerprint(split, "test"));
    expect(requestFingerprint(input, "test")).not.toBe(requestFingerprint({ ...input, email: "other@example.invalid" }, "test"));
    expect(requestFingerprint(input, "test")).not.toBe(requestFingerprint(input, "live"));
  });
  it("rejects mixed key environments and never allows live keys through the local sandbox exception", () => {
    const env = { CULQI_PRIVATE_KEY: "sk_test_fixture", CULQI_PUBLIC_KEY: "pk_test_fixture", WOLF_LOCAL_ONLY: "1", WOLF_DISABLE_EXTERNAL_WRITES: "1", WOLF_ALLOW_CULQI_TEST: "1", WOLF_ENABLE_ONLINE_PAYMENTS: "1" };
    expect(culqiConfiguration(env).enabled).toBe(true);
    expect(culqiConfiguration({ ...env, CULQI_PRIVATE_KEY: "sk_live_fixture" }).enabled).toBe(false);
    expect(culqiConfiguration({ ...env, CULQI_PRIVATE_KEY: "sk_live_fixture", CULQI_PUBLIC_KEY: "pk_live_fixture" }).enabled).toBe(false);
  });
  it("requires captured authorized charge, exact amount, mode, currency and our immutable reference", () => {
    const expected = { id: "intent", amountCents: 1800, gatewayMode: "test" };
    const paid = { object: "charge", id: "chr_test_Example", amount: 1800, currency_code: "PEN", capture: true, paid: false, outcome: { code: "AUT0000" }, metadata: { wolf_attempt_id: "intent" } };
    expect(confirmedCharge(paid, expected)).not.toBeNull();
    for (const invalid of [{ ...paid, capture: false }, { ...paid, outcome: { code: "DECLINED" } }, { ...paid, amount: 1 }, { ...paid, id: "chr_live_Example" }, { ...paid, currency_code: "USD" }, { ...paid, metadata: {} }, { object: "action", action_code: "REVIEW" }]) expect(confirmedCharge(invalid, expected)).toBeNull();
  });
  it("accepts a matching definitive denial without mistaking required authentication for rejection", () => {
    const expected = { id: "intent", amountCents: 900, gatewayMode: "test" };
    const rejected = { object: "charge", id: "chr_test_Example", amount: 900, currency_code: "PEN", capture: true, outcome: { type: "operacion_denegada", code: "DNGE0015", decline_code: "insufficient_funds" }, metadata: { wolf_attempt_id: "intent" } };
    expect(confirmedDecline(rejected, expected)).not.toBeNull();
    expect(confirmedCharge(rejected, expected)).toBeNull();
    for (const invalid of [{ ...rejected, amount: 1 }, { ...rejected, id: "chr_live_Example" }, { ...rejected, metadata: { wolf_attempt_id: "other" } }, { ...rejected, outcome: { type: "operacion_denegada", code: "DNGE0116", decline_code: "authentication_required" } }, { ...rejected, outcome: { type: "operacion_denegada", code: "unknown", decline_code: "processing_error" } }, { ...rejected, outcome: { ...rejected.outcome, code: "AUT0000" } }]) expect(confirmedDecline(invalid, expected)).toBeNull();
  });
});
