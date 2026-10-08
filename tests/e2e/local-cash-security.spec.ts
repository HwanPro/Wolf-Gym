import { test, expect, request as apiRequest, APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import speakeasy from "speakeasy";
import { loadLocalEnvironment, verifyLocalDatabase } from "../../scripts/lib/local-database.mjs";
const local = loadLocalEnvironment();
const db = new PrismaClient({ datasources: { db: { url: local.url } } });
const fixture = JSON.parse(fs.readFileSync(".local/test-accounts.json", "utf8")) as { accounts: { id: string; username: string; password: string; role: string; profileId?: string }[] };
const adminAccount = fixture.accounts.find(row => row.username === "audit_admin")!;
const clientAccount = fixture.accounts.find(row => row.username === "audit_client_a")!;
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";
async function login(account = adminAccount) {
  const context = await apiRequest.newContext({ baseURL });
  const csrf = await (await context.get("/api/auth/csrf")).json();
  await context.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, username: account.username, password: account.password, callbackUrl: baseURL, json: "true" } });
  const session = await (await context.get("/api/auth/session")).json();
  expect(session?.user?.role).toBe(account.role);
  return context;
}
const mutate = (context: APIRequestContext, kind: string, data: unknown, key = randomUUID()) => context.post(`/api/admin/cash/${kind}`, { data, headers: { "Idempotency-Key": key } });
test.beforeAll(async () => { await verifyLocalDatabase(db, local.database); });
test.afterAll(async () => { await db.$disconnect(); });
test("real cashier transactions resist retries, races, forged amounts and ledger deletion", async () => {
  test.setTimeout(180000);
  const admin = await login();
  let sessionId = "";
  const product = await db.inventoryItem.create({ data: { item_name: `AUDIT Caja ${randomUUID().slice(0, 8)}`, item_description: "Producto sintético de prueba local", item_price: 10, item_discount: 0, item_stock: 10, item_image_url: "/uploads/images/logo2.jpg", item_category: "auditoria" } });
  try {
    await test.step("runtime uses local PostgreSQL and blocks external writes", async () => {
      const response = await admin.get("/api/admin/local-environment"); expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ database: local.database, address: "127.0.0.1", port: Number(local.target.port || 5432), externalWritesDisabled: true });
      expect((await admin.get("/api/admin/cash?date=2026-02-30")).status()).toBe(400);
    });
    await test.step("opening is idempotent and only one session can be open", async () => {
      const key = randomUUID(), body = { openingAmount: 100, note: "Auditoría local" };
      const first = await mutate(admin, "open", body, key); expect(first.status()).toBe(200); sessionId = (await first.json()).result.id;
      const second = await mutate(admin, "open", body, key); expect((await second.json()).result.id).toBe(sessionId);
      expect((await mutate(admin, "open", body)).status()).toBe(409);
    });
    const base = { sessionId, items: [{ productId: product.item_id, quantity: 1 }], expectedTotal: 10, payments: [{ method: "CASH", amount: 10 }], cashTendered: 20 };
    await test.step("hostile origin and invalid/forged inputs have no stock effects", async () => {
      expect((await admin.post("/api/admin/cash/sale", { data: base, headers: { Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site", "Idempotency-Key": randomUUID() } })).status()).toBe(403);
      expect((await mutate(admin, "sale", { ...base, expectedTotal: 0.01 })).status()).toBe(409);
      expect((await mutate(admin, "sale", { ...base, unitPrice: 0.01 })).status()).toBe(400);
      expect((await mutate(admin, "sale", { ...base, items: [{ productId: product.item_id, quantity: -1 }] })).status()).toBe(400);
      expect((await mutate(admin, "sale", { ...base, items: [{ productId: "' OR 1=1 --", quantity: 1 }] })).status()).toBe(404);
      expect((await admin.post("/api/admin/cash/sale", { data: base })).status()).toBe(400);
      expect((await mutate(admin, "sale", { ...base, payments: [{ method: "CASH", amount: 11 }] })).status()).toBe(400);
      expect((await mutate(admin, "sale", { ...base, payments: [], cashTendered: 0 })).status()).toBe(400);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } })).item_stock).toBe(10);
    });
    let saleId = "";
    await test.step("simultaneous retries create exactly one sale, payment and stock decrement", async () => {
      const key = randomUUID();
      const responses = await Promise.all([mutate(admin, "sale", base, key), mutate(admin, "sale", base, key)]);
      expect(responses.map(row => row.status())).toEqual([200, 200]);
      const results = await Promise.all(responses.map(row => row.json())); saleId = results[0].result.id;
      expect(results[1].result.id).toBe(saleId); expect(results[0].result.changeCents).toBe(1000);
      expect(await db.cashSale.count({ where: { id: saleId } })).toBe(1);
      expect(await db.paymentRecord.count({ where: { cashSaleId: saleId } })).toBe(1);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } })).item_stock).toBe(9);
      expect((await mutate(admin, "sale", { ...base, cashTendered: 30 }, key)).status()).toBe(409);
    });
    await test.step("split payment and credit preserve debt until real collection", async () => {
      const response = await mutate(admin, "sale", { ...base, customerId: clientAccount.id, payments: [{ method: "YAPE", amount: 3, reference: "AUDIT" }, { method: "CASH", amount: 2 }], cashTendered: 5 });
      expect(response.status()).toBe(200); const sale = (await response.json()).result;
      expect(sale.dueCents).toBe(500); expect(sale.paidCents).toBe(500);
      expect(Number((await db.dailyDebt.findUniqueOrThrow({ where: { cashSaleId: sale.id } })).amount)).toBe(5);
      expect((await admin.delete(`/api/debts?debtId=${(await db.dailyDebt.findUniqueOrThrow({ where: { cashSaleId: sale.id } })).id}`)).status()).toBe(409);
      const key = randomUUID(), body = { saleId: sale.id, sessionId, payments: [{ method: "PLIN", amount: 5, reference: "AUDIT" }], cashTendered: 0 };
      const collection = await mutate(admin, "collect", body, key); expect(collection.status()).toBe(200); expect((await collection.json()).result.dueCents).toBe(0);
      expect((await mutate(admin, "collect", body, key)).status()).toBe(200);
      expect(await db.dailyDebt.findUnique({ where: { cashSaleId: sale.id } })).toBeNull();
      expect(await db.debtHistory.count({ where: { cashSaleId: sale.id, debtType: "paid" } })).toBe(1);
    });
    await test.step("two buyers racing for the last unit cannot oversell", async () => {
      const last = await db.inventoryItem.create({ data: { item_name: `AUDIT Última unidad ${randomUUID()}`, item_description: "Prueba de concurrencia", item_price: 1, item_stock: 1, item_image_url: "/uploads/images/logo2.jpg" } });
      const body = { ...base, items: [{ productId: last.item_id, quantity: 1 }], expectedTotal: 1, payments: [{ method: "CASH", amount: 1 }], cashTendered: 1 };
      expect((await Promise.all([mutate(admin, "sale", body), mutate(admin, "sale", body)])).map(row => row.status()).sort()).toEqual([200, 409]);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: last.item_id } })).item_stock).toBe(0);
    });
    await test.step("reception credit uses the same catalog and replays the last unit", async () => {
      const item = await db.inventoryItem.create({ data: { item_name: `AUDIT Recepción ${randomUUID()}`, item_description: "Prueba local de catálogo único", item_price: 3, item_stock: 1, item_image_url: "/uploads/images/logo2.jpg" } });
      const key = randomUUID(), data = { clientProfileId: clientAccount.profileId, productId: item.item_id, quantity: 1 };
      const responses = await Promise.all([admin.post("/api/debts", { data, headers: { "Idempotency-Key": key } }), admin.post("/api/debts", { data, headers: { "Idempotency-Key": key } })]);
      expect(responses.map(row => row.status())).toEqual([200, 200]);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: item.item_id } })).item_stock).toBe(0);
      expect(await db.purchase.count({ where: { productId: item.item_id } })).toBe(1);
    });
    await test.step("void requires password confirmation and restores stock just once", async () => {
      const body = { saleId, reason: "Devolución sintética auditada" }, key = randomUUID();
      expect((await mutate(admin, "void", body, key)).status()).toBe(428);
      expect((await admin.post("/api/admin/sensitive-access", { data: { password: adminAccount.password } })).status()).toBe(200);
      expect((await mutate(admin, "void", body, key)).status()).toBe(200);
      expect((await mutate(admin, "void", body, key)).status()).toBe(200);
      expect((await mutate(admin, "void", body)).status()).toBe(409);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } })).item_stock).toBe(9);
      expect((await db.paymentRecord.findFirstOrThrow({ where: { cashSaleId: saleId } })).payment_status).toBe("REFUNDED");
      expect(await db.purchase.count({ where: { cashSaleId: saleId } })).toBe(1);
    });
    await test.step("catalog edits are shared and a stale editor cannot undo a sale", async () => {
      const initial = await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } });
      const edit = { item_name: initial.item_name, item_description: initial.item_description, item_price: initial.item_price, item_stock: initial.item_stock, item_discount: 0, expectedUpdatedAt: initial.item_updated_at.toISOString() };
      expect((await mutate(admin, "sale", base)).status()).toBe(200);
      expect((await admin.put(`/api/products/${product.item_id}`, { data: edit })).status()).toBe(409);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } })).item_stock).toBe(8);
      const sku = `AUDIT-${randomUUID()}`;
      const form = { item_name: `AUDIT Servicio ${randomUUID()}`, item_description: "Servicio sin inventario físico", item_price: "4.50", item_stock: "0", item_discount: "0", track_stock: "false", item_sku: sku, category: "servicios", isGymProduct: "false" };
      const response = await admin.post("/api/products", { multipart: form });
      expect(response.status()).toBe(201);
      const service = (await response.json()).product;
      for (const path of ["/api/products", "/api/products/gym", "/api/products/public"]) {
        const products = await (await admin.get(path)).json();
        expect(products.find((row: { item_id: string }) => row.item_id === service.item_id)).toMatchObject({ item_price: 4.5, item_stock: 0, track_stock: false, item_sku: sku });
      }
      expect((await mutate(admin, "sale", { ...base, items: [{ productId: service.item_id, quantity: 2 }], expectedTotal: 9, payments: [{ method: "CASH", amount: 9 }], cashTendered: 9 })).status()).toBe(200);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: service.item_id } })).item_stock).toBe(0);
    });
    await test.step("closing preserves the ledger and prevents later writes", async () => {
      expect((await mutate(admin, "movement", { sessionId, kind: "OUT", amount: 9999, reason: "Retiro imposible" })).status()).toBe(409);
      expect((await mutate(admin, "movement", { sessionId, kind: "IN", amount: 5, reason: "Fondo adicional" })).status()).toBe(200);
      const data = await (await admin.get("/api/admin/cash")).json();
      const debtsBefore = await db.dailyDebt.count();
      expect((await admin.post("/api/debts/cleanup", { headers: { "x-internal-call": "true" } })).status()).toBe(409);
      expect(await db.dailyDebt.count()).toBe(debtsBefore);
      const body = { sessionId, countedAmount: data.session.expectedCents / 100, note: "Cierre auditado" }, key = randomUUID();
      expect((await mutate(admin, "close", body, key)).status()).toBe(200);
      expect((await mutate(admin, "close", body, key)).status()).toBe(200);
      expect((await mutate(admin, "sale", base)).status()).toBe(409);
      expect((await mutate(admin, "movement", { sessionId, kind: "IN", amount: 1, reason: "Turno cerrado" })).status()).toBe(409);
      expect(await db.cashSale.count({ where: { sessionId } })).toBe(6);
      sessionId = "";
    });
  } finally {
    if (sessionId) {
      const data = await (await admin.get("/api/admin/cash")).json();
      if (data.session?.id === sessionId) await mutate(admin, "close", { sessionId, countedAmount: data.session.expectedCents / 100, note: "Cierre tras prueba" });
    }
    await admin.dispose();
  }
});
test("real clients cannot elevate privileges, forge ownership, or keep revoked sessions", async ({ request }) => {
  test.setTimeout(180000);
  const admin = await login();
  const actualClient = await login(clientAccount);
  try {
    const debtsBefore = await db.dailyDebt.count();
    expect((await request.post("/api/debts/cleanup", { headers: { "x-internal-call": "true" } })).status()).toBe(401);
    expect((await actualClient.post("/api/debts/cleanup", { headers: { "x-internal-call": "true" } })).status()).toBe(403);
    expect(await db.dailyDebt.count()).toBe(debtsBefore);
    for (const path of ["/api/admin/cash", "/api/products/gym", "/api/admin/reports", "/api/check-in/history"]) expect((await actualClient.get(path)).status()).toBe(403);
    expect((await mutate(actualClient, "open", { openingAmount: 0 })).status()).toBe(403);
    expect((await actualClient.post("/api/auth/verify-email", { data: { userId: adminAccount.id, email: "audit@example.invalid" } })).status()).toBe(403);
    const otherClient = fixture.accounts.find(row => row.username === "audit_client_b")!;
    const workout = await db.workoutSession.create({ data: { userId: otherClient.id, notes: "AUDIT dato privado" } });
    expect((await actualClient.patch(`/api/workouts/${workout.id}`, { data: { notes: "Ataque IDOR" } })).status()).toBe(404);
    expect((await actualClient.put(`/api/workouts/${workout.id}/complete`, { data: {} })).status()).toBe(404);
    expect((await db.workoutSession.findUniqueOrThrow({ where: { id: workout.id } })).notes).toBe("AUDIT dato privado");
    const paymentAttemptsBefore = await db.onlinePaymentAttempt.count();
    expect((await actualClient.post("/api/payments/culqi", { data: { token: "test", email: "audit@example.invalid", items: [{ productId: "d1000000-0000-4000-8000-000000000001", quantity: 1 }] } })).status()).toBe(400);
    expect(await db.onlinePaymentAttempt.count()).toBe(paymentAttemptsBefore);
    const forged = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: clientAccount.id, role: "admin", credentialVersion: "fake" }, maxAge: 600 });
    expect((await request.get("/api/admin/cash", { headers: { Cookie: `next-auth.session-token=${forged}` } })).status()).toBe(401);
    const enrollment = await actualClient.post("/api/auth/2FA", { data: {} }); expect(enrollment.status()).toBe(200);
    const value = await enrollment.json();
    const activation = await actualClient.put("/api/auth/2FA", { data: { secret: value.secret, token: speakeasy.totp({ secret: value.secret, encoding: "base32" }) } });
    expect(activation.status()).toBe(200);
    expect((await actualClient.get("/api/user/me")).status()).toBe(401);
    await db.user.update({ where: { id: clientAccount.id }, data: { twoFASecret: null } });
    expect((await actualClient.get("/api/user/me")).status()).toBe(401);
  } finally { await db.user.update({ where: { id: clientAccount.id }, data: { twoFASecret: null } }); await actualClient.dispose(); await admin.dispose(); }
});
test("cashier page recovers lost responses, clears the cart and fits the viewport", async ({ page, context }) => {
  test.setTimeout(120000);
  const admin = await login();
  await context.addCookies((await admin.storageState()).cookies);
  let sessionId = "";
  const product = await db.inventoryItem.create({ data: { item_name: `AUDIT Red ${randomUUID()}`, item_description: "Recuperación de respuesta perdida", item_price: 1, item_stock: 2, item_image_url: "/uploads/images/logo2.jpg" } });
  try {
    await page.goto("/admin/sales");
    await expect(page.getByRole("heading", { name: "Caja y ventas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir turno" })).toBeVisible();
    await page.getByLabel("Fondo inicial (S/)").fill("20"); await page.getByRole("button", { name: "Abrir turno", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Caja abierta", exact: true })).toBeVisible();
    sessionId = (await (await admin.get("/api/admin/cash")).json()).session.id;
    await page.route("**/api/admin/cash/sale", async route => {
      const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.abort("failed"); // The DB committed; the browser never receives its response.
    });
    for (const reload of [false, true]) {
      await page.getByLabel("Buscar nombre o SKU").fill(product.item_name);
      await page.getByRole("button", { name: new RegExp(product.item_name) }).click();
      await page.getByRole("button", { name: "Efectivo exacto" }).click();
      await page.getByRole("button", { name: "Revisar venta" }).click();
      await expect(page.getByText("Revise antes de confirmar")).toBeVisible();
      await page.getByRole("button", { name: "Confirmar venta", exact: true }).click();
      await expect(page.getByRole("button", { name: "Consultar resultado" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Revisar venta", exact: true })).toBeDisabled();
      if (reload) await page.reload();
      await page.getByRole("button", { name: "Consultar resultado" }).click();
      await expect(page.getByRole("region", { name: "Comprobante de venta" })).toBeVisible();
      await expect(page.getByText("Seleccione productos del catálogo.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Consultar resultado" })).toHaveCount(0);
      await page.getByRole("button", { name: "Cerrar ticket" }).click();
    }
    expect(await db.purchase.count({ where: { productId: product.item_id } })).toBe(2);
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { item_id: product.item_id } })).item_stock).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); expect(overflow).toBe(false);
  } finally {
    if (sessionId) { const data = await (await admin.get("/api/admin/cash")).json(); await mutate(admin, "close", { sessionId, countedAmount: data.session.expectedCents / 100, note: "Cierre prueba interfaz" }); }
    await admin.dispose();
  }
});

test("local email verification and password recovery consume tokens once and revoke real sessions", async ({ request }) => {
  test.setTimeout(180000);
  const account = fixture.accounts.find(row => row.username === "audit_client_b")!;
  const original = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const owner = await login(account), other = await login(clientAccount);
  const email = `audit-${randomUUID()}@example.invalid`;
  try {
    const response = await owner.post("/api/auth/verify-email", { data: { email, type: "code" } }); expect(response.status()).toBe(200);
    const outbox = () => fs.readdirSync(".local/mail-outbox").map(file => JSON.parse(fs.readFileSync(`.local/mail-outbox/${file}`, "utf8")) as { to: string; text?: string; html?: string; subject: string }).filter(row => row.to === email);
    const verificationMail = outbox().find(row => row.text?.includes("código"))!;
    const code = verificationMail.text!.match(/\d{6}/)![0];
    expect((await other.put("/api/auth/verify-email", { data: { userId: account.id, code } })).status()).toBe(403);
    const confirmations = await Promise.all([owner.put("/api/auth/verify-email", { data: { code } }), owner.put("/api/auth/verify-email", { data: { code } })]);
    expect(confirmations.map(row => row.status()).sort()).toEqual([200, 400]);
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).username).toBe(email);
    expect((await request.post("/api/auth/reset-password", { data: { identifier: email } })).status()).toBe(200);
    const resetMail = outbox().find(row => row.html?.includes("reset-password?token="))!;
    const token = resetMail.html!.match(/reset-password\?token=([a-f0-9]{64})/)![1];
    const newPassword = `Test-${randomUUID()}`;
    const resets = await Promise.all([request.post("/api/auth/set-new-password", { data: { token, newPassword } }), request.post("/api/auth/set-new-password", { data: { token, newPassword } })]);
    expect(resets.map(row => row.status()).sort()).toEqual([200, 400]);
    expect((await owner.get("/api/user/me")).status()).toBe(401);
    const updated = await login({ ...account, username: email, password: newPassword }); await updated.dispose();
    await db.user.update({ where: { id: account.id }, data: { username: original.username, password: original.password } });
    expect((await owner.get("/api/user/me")).status()).toBe(401);
  } finally {
    await db.user.update({ where: { id: account.id }, data: { username: original.username, password: original.password } });
    await owner.dispose(); await other.dispose();
  }
});
