import { PrismaClient } from "@prisma/client";

// Definir prisma en `globalThis` de forma segura
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
if (process.env.WOLF_LOCAL_ONLY === "1") {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("La ejecución local exige una base de datos de loopback");
}

// Reutilizar prisma si ya está definido, o crear una nueva instancia
const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
