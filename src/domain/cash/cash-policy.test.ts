import { describe, it, expect } from "vitest";
import { cashQuote, paymentTotals, saleSchema, money } from "./cash-policy";
const product = { item_id: "p", item_name: "Agua", item_price: 2.5, item_discount: 0, item_stock: 2, track_stock: true };
describe("cash integrity", () => {
  it("uses catalog price, groups products and rejects total quantity above stock", () => {
    const result = cashQuote([product], { items: [{ productId: "p", quantity: 1 }, { productId: "p", quantity: 1 }], discountPercent: 0 });
    expect(result.lines).toHaveLength(1); expect(result.totalCents).toBe(500);
    expect(() => cashQuote([product], { items: [{ productId: "p", quantity: 3 }], discountPercent: 0 })).toThrow("Stock");
  });
  it("permits services without consuming stock", () => {
    expect(cashQuote([{ ...product, track_stock: false, item_stock: 0 }], { items: [{ productId: "p", quantity: 5 }], discountPercent: 0 }).totalCents).toBe(1250);
  });
  it("rounds discounted unit and additional line discount to cents", () => {
    const result = cashQuote([{ ...product, item_price: 9.99, item_discount: 15 }], { items: [{ productId: "p", quantity: 2 }], discountPercent: 10 });
    expect(result.subtotalCents).toBe(1698); expect(result.totalCents).toBe(1528); expect(result.discountCents).toBe(170);
  });
  it("tracks split payments, credit and change separately", () => {
    expect(paymentTotals([{ method: "CASH", amount: 2, reference: "" }, { method: "YAPE", amount: 1, reference: "r" }], 500, 5)).toEqual({ paidCents: 300, dueCents: 200, cashCents: 200, tenderedCents: 500, changeCents: 300 });
  });
  it("rejects overpayment and insufficient cash", () => {
    expect(() => paymentTotals([{ method: "CASH", amount: 6, reference: "" }], 500, 6)).toThrow("exceden");
    expect(() => paymentTotals([{ method: "CASH", amount: 2, reference: "" }], 500, 1)).toThrow("efectivo");
    expect(() => paymentTotals([], 500, 1)).toThrow("efectivo");
  });
  it("rejects unknown fields, forged prices and fractional quantities", () => {
    const input = { sessionId: "s", items: [{ productId: "p", quantity: 1 }], expectedTotal: 2.5, payments: [] };
    expect(saleSchema.safeParse(input).success).toBe(true);
    expect(saleSchema.safeParse({ ...input, amount: 0.01 }).success).toBe(false);
    expect(saleSchema.safeParse({ ...input, items: [{ productId: "p", quantity: 0.5 }] }).success).toBe(false);
    expect(money.safeParse(1.001).success).toBe(false); expect(money.safeParse(Infinity).success).toBe(false);
  });
});
