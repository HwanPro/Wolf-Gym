import { spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnvironment, verifyLocalDatabase } from "./lib/local-database.mjs";

const { url, database } = loadLocalEnvironment();
const db = new PrismaClient({ datasources: { db: { url } } });
try {
  const identity = await verifyLocalDatabase(db, database);
  await db.$disconnect();
  const mode = process.argv[2] || "dev";
  if (!["dev", "start", "build"].includes(mode)) throw new Error("Modo inválido");
  const port = process.argv[3] || "3000";
  if (!/^\d{4,5}$/.test(port)) throw new Error("Puerto inválido");
  const args = [path.resolve("node_modules/next/dist/bin/next"), mode];
  process.env.NODE_ENV = mode === "dev" ? "development" : "production";
  if (mode !== "build") args.push("-p", port, "--hostname", "127.0.0.1");
  if (mode !== "build") process.env.NEXTAUTH_URL = `http://127.0.0.1:${port}`;
  if (process.argv[4]) process.env.NEXT_DIST_DIR = process.argv[4];
  process.env.WOLF_DISABLE_EXTERNAL_WRITES = "1";
  console.log("PostgreSQL local confirmado:", identity.database, identity.address, identity.port);
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env, windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code || 0)); });
} catch { console.error("No se inicia Next: entorno local no verificado."); process.exitCode = 1; }
finally { await db.$disconnect(); }
