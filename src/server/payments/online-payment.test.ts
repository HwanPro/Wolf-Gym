import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, database } = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    onlinePaymentAttempt: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    inventoryItem: { update: vi.fn() }, paymentRecord: { update: vi.fn() },
  };
  return { transaction, database: { $transaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => fn(transaction)) } };
});
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: database }));
import { cancelUnchargedPayment } from "./online-payment";

describe("cancellation before an authenticated charge", () => {
  const payload = { lines: [{ productId: "product", quantity: 2, lineTotal: 18, trackStock: true }], plan: null };
  const pending = { id: "attempt", userId: "owner", state: "REQUIRES_3DS", chargeId: null, paymentId: 1, payload };
  beforeEach(() => { vi.clearAllMocks(); transaction.onlinePaymentAttempt.findUniqueOrThrow.mockResolvedValue(pending); });
  it.each(["RESERVED", "REQUIRES_3DS"])("releases the reservation and records cancellation together for %s", async state => {
    transaction.onlinePaymentAttempt.findUniqueOrThrow.mockResolvedValue({ ...pending, state });
    await cancelUnchargedPayment("owner", "intent");
    expect(transaction.inventoryItem.update).toHaveBeenCalledWith({ where: { item_id: "product" }, data: { item_stock: { increment: 2 } } });
    expect(transaction.paymentRecord.update).toHaveBeenCalledWith({ where: { payment_id: 1 }, data: { payment_status: "FAILED" } });
    expect(transaction.onlinePaymentAttempt.update).toHaveBeenCalledWith({ where: { id: "attempt" }, data: { state: "FAILED", lastErrorCode: "USER_CANCELLED" } });
  });
  it("does not restore stock a second time", async () => {
    transaction.onlinePaymentAttempt.findUniqueOrThrow.mockResolvedValue({ ...pending, state: "FAILED", lastErrorCode: "USER_CANCELLED" });
    await cancelUnchargedPayment("owner", "intent");
    expect(transaction.inventoryItem.update).not.toHaveBeenCalled();
    expect(transaction.paymentRecord.update).not.toHaveBeenCalled();
  });
  it.each(["DISPATCHING", "CHARGED", "REVIEW", "COMPLETED"])("keeps %s for reconciliation, without releasing stock", async state => {
    transaction.onlinePaymentAttempt.findUniqueOrThrow.mockResolvedValue({ ...pending, state });
    await expect(cancelUnchargedPayment("owner", "intent")).rejects.toThrow("Consulta su estado");
    expect(transaction.inventoryItem.update).not.toHaveBeenCalled();
  });
});
