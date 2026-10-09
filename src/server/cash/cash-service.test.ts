import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), aggregate: vi.fn() });
  const tx = { $queryRaw: vi.fn(), cashAction: model(), user: model(), cashSession: model(), cashMovement: model(), inventoryItem: model(), cashSale: model(), purchase: model(), paymentRecord: model(), dailyDebt: model(), debtHistory: model() };
  return { tx, transaction: vi.fn() };
});
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: { $transaction: mocks.transaction } }));
import { executeCashAction } from "./cash-service";
const key = "1e102687-78a2-4e8b-a2ef-59e2d75f6219";
const saleBody = { sessionId: "s", items: [{ productId: "p", quantity: 1 }], expectedTotal: 10, payments: [{ method: "CASH", amount: 10 }], cashTendered: 10 };
const sale = { id: "sale", number: 1, sessionId: "s", customerId: "client", cashierId: "admin", status: "CREDIT", totalCents: 1000, paidCents: 500, dueCents: 500, lines: [{ productId: "p", quantity: 1, stockTracked: true }], payments: [{ payment_status: "COMPLETED", tenderMethod: "CASH", payment_amount: 5 }] };
const debt = { id: "d", cashSaleId: "sale", clientProfileId: "profile", productType: "CUSTOM", productName: "Crédito", amount: 5, quantity: 1, createdAt: new Date(), productId: null };
const run = (kind: string, body: unknown) => executeCashAction("admin", kind, key, body);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
  mocks.tx.user.findUnique.mockResolvedValue({ role: "admin" });
  mocks.tx.cashSession.findUnique.mockResolvedValue({ id: "s", status: "OPEN" });
  mocks.tx.cashSession.findUniqueOrThrow.mockResolvedValue({ openingCents: 10000 });
  mocks.tx.cashMovement.aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
  mocks.tx.cashSession.create.mockResolvedValue({ id: "s" });
  mocks.tx.cashSession.update.mockResolvedValue({ id: "s", status: "CLOSED" });
  mocks.tx.cashMovement.create.mockResolvedValue({ id: "m" });
  mocks.tx.inventoryItem.findMany.mockResolvedValue([{ item_id: "p", item_name: "Producto", item_price: 10, item_discount: 0, item_stock: 3, track_stock: true }]);
  mocks.tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.cashSale.create.mockResolvedValue(sale);
  mocks.tx.cashSale.findUnique.mockResolvedValue(sale);
  mocks.tx.cashSale.findUniqueOrThrow.mockResolvedValue(sale);
  mocks.tx.cashSale.update.mockResolvedValue(sale);
  mocks.tx.dailyDebt.findUnique.mockResolvedValue(debt);
});
describe("persistent cashier operations", () => {
  it("requires a UUID intent and a known, valid action", async () => {
    await expect(executeCashAction("admin", "open", null, {})).rejects.toThrow("UUID");
    await expect(run("bad", {})).rejects.toThrow("desconocida");
    await expect(run("open", { openingAmount: -1 })).rejects.toThrow();
  });
  it("rechecks the operator role inside the locked transaction", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ role: "client" });
    await expect(run("open", { openingAmount: 0 })).rejects.toThrow("No autorizado");
    expect(mocks.tx.cashSession.create).not.toHaveBeenCalled();
  });
  it("replays an existing intent and rejects conflicting payloads", async () => {
    const requestHash = createHash("sha256").update(JSON.stringify({ openingAmount: 0, note: "" })).digest("hex");
    mocks.tx.cashAction.findUnique.mockResolvedValue({ requestHash, result: { ok: true, result: { id: "same" } } });
    expect(await run("open", { openingAmount: 0 })).toEqual({ ok: true, result: { id: "same" } });
    await expect(run("open", { openingAmount: 1 })).rejects.toThrow("otra operación");
    expect(mocks.tx.cashSession.create).not.toHaveBeenCalled();
  });
  it("opens a session and rejects a second open session", async () => {
    expect(await run("open", { openingAmount: 10, note: "fondo" })).toMatchObject({ ok: true });
    expect(mocks.tx.cashSession.create).toHaveBeenCalledWith({ data: { openedBy: "admin", openingCents: 1000, openingNote: "fondo" } });
    mocks.tx.cashSession.findFirst.mockResolvedValue({ id: "s" });
    await expect(run("open", { openingAmount: 10 })).rejects.toThrow("ya está abierta");
  });
  it("requires an open session and a reason for an unbalanced closure", async () => {
    mocks.tx.cashSession.findUnique.mockResolvedValue(null);
    await expect(run("close", { sessionId: "s", countedAmount: 100 })).rejects.toThrow("vigente");
    mocks.tx.cashSession.findUnique.mockResolvedValue({ status: "OPEN" });
    await expect(run("close", { sessionId: "s", countedAmount: 99 })).rejects.toThrow("diferencia");
    await run("close", { sessionId: "s", countedAmount: 99, note: "Faltante auditado" });
    expect(mocks.tx.cashSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expectedCents: 10000, countedCents: 9900, differenceCents: -100 }) }));
  });
  it("registers signed movements and rejects withdrawals without funds", async () => {
    await run("movement", { sessionId: "s", kind: "OUT", amount: 5, reason: "retirar" });
    expect(mocks.tx.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: -500 }) }));
    await run("movement", { sessionId: "s", kind: "IN", amount: 5, reason: "ingreso" });
    await expect(run("movement", { sessionId: "s", kind: "OUT", amount: 101, reason: "retirar" })).rejects.toThrow("insuficiente");
    mocks.tx.cashSession.findUniqueOrThrow.mockResolvedValue({ openingCents: 99999999 });
    await expect(run("movement", { sessionId: "s", kind: "IN", amount: 1, reason: "ingreso" })).rejects.toThrow("límite");
  });
  it("rejects changed prices, undocumented discounts and unavailable stock", async () => {
    await expect(run("sale", { ...saleBody, expectedTotal: 1 })).rejects.toThrow("precio cambió");
    await expect(run("sale", { ...saleBody, discountPercent: 10, expectedTotal: 9 })).rejects.toThrow("motivo");
    mocks.tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(run("sale", saleBody)).rejects.toThrow("Stock modificado");
    expect(mocks.tx.cashSale.create).not.toHaveBeenCalled();
  });
  it("rejects invalid customers and credit without a client profile", async () => {
    await expect(run("sale", { ...saleBody, customerId: "bad" })).rejects.toThrow("Cliente inválido");
    await expect(run("sale", { ...saleBody, payments: [], cashTendered: 0 })).rejects.toThrow("perfil");
    mocks.tx.user.findUnique.mockResolvedValueOnce({ role: "admin" }).mockResolvedValueOnce({ id: "c", role: "client", profile: null });
    await expect(run("sale", { ...saleBody, customerId: "c", payments: [], cashTendered: 0 })).rejects.toThrow("perfil");
  });
  it("records anonymous payments, purchases and stock with the immutable quote", async () => {
    await run("sale", saleBody);
    expect(mocks.tx.inventoryItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { item_stock: { decrement: 1 } } }));
    expect(mocks.tx.cashSale.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerName: "Venta mostrador", totalCents: 1000, status: "COMPLETED" }) }));
    expect(mocks.tx.paymentRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment_amount: 10, payment_method: "CASH", tenderMethod: "CASH" }) }));
  });
  it("rejects a cash receipt that exceeds the register balance limit", async () => {
    mocks.tx.cashSession.findUniqueOrThrow.mockResolvedValue({ openingCents: 99999999 });
    await expect(run("sale", saleBody)).rejects.toThrow("límite");
  });
  it("supports services, credits and non-cash tender without stock consumption", async () => {
    mocks.tx.inventoryItem.findMany.mockResolvedValue([{ item_id: "p", item_name: "Servicio", item_price: 10, item_discount: 0, item_stock: 0, track_stock: false }]);
    mocks.tx.user.findUnique.mockResolvedValueOnce({ role: "admin" }).mockResolvedValueOnce({ id: "client", role: "client", firstName: "", lastName: "", username: "Cliente", profile: { profile_id: "profile" } });
    await run("sale", { ...saleBody, customerId: "client", payments: [{ method: "YAPE", amount: 5, reference: "r" }], cashTendered: 0 });
    expect(mocks.tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.dailyDebt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 5, cashSaleId: "sale" }) }));
    expect(mocks.tx.paymentRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenderMethod: "YAPE", payment_method: "TRANSFER" }) }));
    expect(mocks.tx.cashMovement.create).not.toHaveBeenCalled();
  });
  it.each(["CARD", "TRANSFER", "OTHER"])("records %s under its supported legacy payment method", async method => {
    await run("sale", { ...saleBody, payments: [{ method, amount: 10 }], cashTendered: 0 });
    expect(mocks.tx.paymentRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment_method: method, tenderMethod: method }) }));
  });
  it("supports partial collection and archives the debt on full collection", async () => {
    await run("collect", { saleId: "sale", sessionId: "s", payments: [{ method: "CARD", amount: 2 }] });
    expect(mocks.tx.dailyDebt.updateMany).toHaveBeenCalledWith({ where: { cashSaleId: "sale" }, data: { amount: 3 } });
    await run("collect", { saleId: "sale", sessionId: "s", payments: [{ method: "CASH", amount: 5 }], cashTendered: 5 });
    expect(mocks.tx.debtHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ debtType: "paid", cashSaleId: "sale" }) }));
    expect(mocks.tx.dailyDebt.delete).toHaveBeenCalledWith({ where: { id: "d" } });
  });
  it.each([null, { ...sale, status: "VOIDED" }, { ...sale, dueCents: 0 }])("rejects uncollectible sales", async value => {
    mocks.tx.cashSale.findUnique.mockResolvedValue(value);
    await expect(run("collect", { saleId: "sale", sessionId: "s", payments: [{ method: "CARD", amount: 1 }] })).rejects.toThrow("cobrable");
  });
  it("voids stock and payments once while preserving the archived financial record", async () => {
    await run("void", { saleId: "sale", reason: "devolución" });
    expect(mocks.tx.inventoryItem.update).toHaveBeenCalledWith({ where: { item_id: "p" }, data: { item_stock: { increment: 1 } } });
    expect(mocks.tx.paymentRecord.updateMany).toHaveBeenCalledWith({ where: { cashSaleId: "sale", payment_status: "COMPLETED" }, data: { payment_status: "REFUNDED" } });
    expect(mocks.tx.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "VOID", amountCents: -500 }) }));
    expect(mocks.tx.purchase.delete).not.toHaveBeenCalled();
  });
  it("rejects voids of missing or already voided sales and insufficient cash", async () => {
    mocks.tx.cashSale.findUnique.mockResolvedValue(null);
    await expect(run("void", { saleId: "sale", reason: "devolución" })).rejects.toThrow("inexistente");
    mocks.tx.cashSale.findUnique.mockResolvedValue({ ...sale, status: "VOIDED" });
    await expect(run("void", { saleId: "sale", reason: "devolución" })).rejects.toThrow("anulada");
    mocks.tx.cashSale.findUnique.mockResolvedValue(sale);
    mocks.tx.cashSession.findUniqueOrThrow.mockResolvedValue({ openingCents: 0 });
    await expect(run("void", { saleId: "sale", reason: "devolución" })).rejects.toThrow("insuficiente");
  });
  it("voids a service without restocking and skips nonexistent debt", async () => {
    mocks.tx.cashSale.findUnique.mockResolvedValue({ ...sale, lines: [{ ...sale.lines[0], stockTracked: false }], payments: [] });
    mocks.tx.dailyDebt.findUnique.mockResolvedValue(null);
    await run("void", { saleId: "sale", reason: "devolución" });
    expect(mocks.tx.inventoryItem.update).not.toHaveBeenCalled(); expect(mocks.tx.cashMovement.create).not.toHaveBeenCalled();
  });
});
