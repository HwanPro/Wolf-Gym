import fs from "node:fs";
import crypto from "node:crypto";
import { request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnvironment, verifyLocalDatabase } from "./lib/local-database.mjs";

const { url, database } = loadLocalEnvironment();
const db = new PrismaClient({ datasources: { db: { url } } });
const baseURL = "http://127.0.0.1:3100";
await verifyLocalDatabase(db, database);
const account = JSON.parse(fs.readFileSync(".local/test-accounts.json", "utf8")).accounts.find(a => a.role === "admin");
const api = await request.newContext({ baseURL });
try {
  const csrf = await (await api.get("/api/auth/csrf")).json();
  await api.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, username: account.username, password: account.password, json: "true", callbackUrl: baseURL + "/admin/dashboard" } });
  const session = await (await api.get("/api/auth/session")).json();
  if (session?.user?.role !== "admin") throw new Error("No se logró autenticar la cuenta local.");
  const productId = "d1000000-0000-4000-8000-000000000001";
  const before = await db.purchase.count({ where: { customerId: account.id, productId } });
  const crossSite = await api.post("/api/admin/sales/daily", { headers: { Origin: "https://untrusted.invalid", "Sec-Fetch-Site": "cross-site" }, data: { items: [{ productId, quantity: 1 }] } });
  const key = crypto.randomUUID();
  const repeats = [];
  for (let i = 0; i < 2; i++) repeats.push(await api.post("/api/admin/sales/daily", { headers: { "Idempotency-Key": key }, data: { items: [{ productId, quantity: 1 }] } }));
  const after = await db.purchase.count({ where: { customerId: account.id, productId } });
  const result = { localDatabase: database, checkedAt: new Date().toISOString(),
    csrf: { status: crossSite.status(), vulnerable: crossSite.ok() },
    duplicateIntent: { statuses: repeats.map(r => r.status()), purchaseRowsCreated: after - before - (crossSite.ok() ? 1 : 0), vulnerable: repeats.every(r => r.ok()) },
  };
  fs.writeFileSync(".local/security-baseline.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await api.dispose(); await db.$disconnect(); }
