import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnvironment, verifyLocalDatabase } from "./lib/local-database.mjs";

const { url, database } = loadLocalEnvironment();
const db = new PrismaClient({ datasources: { db: { url } } });
const credentialsFile = ".local/test-accounts.json";
async function main() {
  const identity = await verifyLocalDatabase(db, database);
  fs.mkdirSync(".local", { recursive: true });
  const previous = fs.existsSync(credentialsFile) ? JSON.parse(fs.readFileSync(credentialsFile, "utf8")) : null;
  const descriptions = [
    ["audit_admin", "admin", "Administrador", 1, 30],
    ["audit_client_a", "client", "Cliente A", 2, 30],
    ["audit_client_b", "client", "Cliente B", 3, 30],
    ["audit_expired", "client", "Cliente vencido", 4, -1],
    ["audit_expires_today", "client", "Cliente vence hoy", 5, 0],
    ["audit_no_plan", "client", "Cliente sin plan", 6, null],
  ];
  const accounts = [];
  for (const [username, role, firstName, index, days] of descriptions) {
    const password = previous?.accounts?.find(account => account.username === username)?.password || crypto.randomBytes(24).toString("base64url");
    const existing = await db.user.findUnique({ where: { username }, select: { phoneNumber: true } });
    const phoneNumber = "+519880000" + String(index).padStart(2, "0");
    if (existing && existing.phoneNumber !== phoneNumber) throw new Error("El nombre de prueba pertenece a otra cuenta.");
    const hashed = await bcrypt.hash(password, 12);
    const user = await db.user.upsert({
      where: { username }, update: { password: hashed, role, twoFASecret: null },
      create: { username, role, firstName, lastName: "Prueba local", phoneNumber, password: hashed },
      select: { id: true, username: true, role: true },
    });
    if (role === "client") {
      const now = new Date();
      const limaDay = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
      const end = days === null ? null : new Date(limaDay + "T12:00:00-05:00");
      if (end) end.setUTCDate(end.getUTCDate() + days);
      const data = { profile_first_name: firstName, profile_last_name: "Prueba local", profile_phone: phoneNumber,
        documentNumber: "799900" + String(index).padStart(2, "0"), profile_plan: days === null ? null : "Plan local de prueba",
        profile_start_date: new Date(now.getTime() - 7 * 86400000), profile_end_date: end };
      const profile = await db.clientProfile.upsert({ where: { user_id: user.id }, update: data, create: { user_id: user.id, ...data }, select: { profile_id: true } });
      accounts.push({ ...user, password, phoneNumber, profileId: profile.profile_id });
    } else accounts.push({ ...user, password, phoneNumber });
  }
  const products = [
    ["d1000000-0000-4000-8000-000000000001", "Agua local", 2.5, 30, 0, "bebidas"],
    ["d1000000-0000-4000-8000-000000000002", "Proteína local", 10, 20, 10, "suplementos"],
    ["d1000000-0000-4000-8000-000000000003", "Pre entreno local", 5, 15, 0, "suplementos"],
    ["d1000000-0000-4000-8000-000000000004", "Producto agotado local", 4, 0, 0, "bebidas"],
  ];
  for (const [item_id, item_name, item_price, item_stock, item_discount, item_category] of products) {
    await db.inventoryItem.upsert({ where: { item_id }, update: {}, create: {
      item_id, item_name, item_price, item_stock, item_discount, item_category,
      item_description: "Datos sintéticos para pruebas locales", item_image_url: "/uploads/images/logo2.jpg", is_admin_only: false,
    } });
  }
  fs.writeFileSync(credentialsFile, JSON.stringify({ database, generatedAt: new Date().toISOString(), accounts }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ database: identity.database, address: identity.address, port: identity.port, accounts: accounts.map(({ username, role }) => ({ username, role })), credentialsFile }));
}
main().catch(() => { console.error("No se pudo preparar el entorno local; no se consultó producción."); process.exitCode = 1; }).finally(() => db.$disconnect());
