import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnvironment, verifyLocalDatabase } from "./lib/local-database.mjs";

const { url, database, target } = loadLocalEnvironment();
const db = new PrismaClient({ datasources: { db: { url } } });
const mode = process.argv[2];
try {
  const identity = await verifyLocalDatabase(db, database);
  console.log(JSON.stringify(identity));
  await db.$disconnect();
  let executable = process.execPath;
  let args;
  let env = process.env;
  if (mode === "inspect") process.exit(0);
  if (mode === "backup") {
    fs.mkdirSync(".local/backups", { recursive: true });
    executable = "C:/Program Files/PostgreSQL/17/bin/pg_dump.exe";
    args = ["--format=custom", "--file", path.resolve(".local/backups/wolfgym-" + Date.now() + ".dump")];
    env = { ...process.env, PGHOST: target.hostname, PGPORT: target.port || "5432", PGDATABASE: database, PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password) };
  } else {
    const cli = path.resolve("node_modules/prisma/build/index.js");
    if (mode === "diff") args = [cli, "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--output", ".local/schema-diff.sql"];
    else if (mode === "apply") {
      const file = path.resolve(process.argv[3] || "");
      const allowed = path.resolve("prisma/migrations") + path.sep;
      if (!file.startsWith(allowed) || !file.endsWith(path.sep + "migration.sql")) throw new Error("Solo se permite una migración revisada del proyecto.");
      args = [cli, "db", "execute", "--file", file, "--schema", "prisma/schema.prisma"];
    } else if (mode === "deploy") args = [cli, "migrate", "deploy", "--schema", "prisma/schema.prisma"];
    else throw new Error("Modo local no válido.");
  }
  const child = spawn(executable, args, { stdio: "inherit", env, windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code || 0)); });
} catch { console.error("Operación local rechazada o fallida."); process.exitCode = 1; }
finally { await db.$disconnect(); }
