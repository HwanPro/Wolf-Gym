import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export function loadLocalEnvironment() {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) throw new Error("Falta .env.local; se rechaza usar .env como alternativa.");
  const values = dotenv.parse(fs.readFileSync(file));
  const url = values.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL local.");
  const target = new URL(url);
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(target.hostname) ||
      ["host", "service", "socket", "options"].some(key => target.searchParams.has(key))) {
    throw new Error("Operación rechazada: PostgreSQL debe estar en loopback, sin redirecciones de host.");
  }
  const database = decodeURIComponent(target.pathname.slice(1));
  if (!database || ["postgres", "template0", "template1"].includes(database)) throw new Error("Se requiere una base local dedicada.");
  Object.assign(process.env, values, { WOLF_LOCAL_ONLY: "1" });
  return { url, target, database };
}

export async function verifyLocalDatabase(prisma, expectedDatabase) {
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port, current_setting('server_version') AS version`;
  if (identity.database !== expectedDatabase || !["127.0.0.1", "::1"].includes(identity.address)) throw new Error("El servidor conectado no coincide con la base local esperada.");
  return identity;
}
