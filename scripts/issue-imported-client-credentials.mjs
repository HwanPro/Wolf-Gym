import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const since = new Date(getArg("--since") || "");
const until = new Date(getArg("--until") || "");
const apply = process.argv.includes("--apply");
const output = path.resolve(
  getArg("--output") || `.tmp/imported-client-credentials-${Date.now()}.csv`,
);

if (
  Number.isNaN(since.getTime()) ||
  Number.isNaN(until.getTime()) ||
  since >= until
) {
  throw new Error("Usa --since y --until con un intervalo ISO válido");
}

const prisma = new PrismaClient();
try {
  const users = await prisma.user.findMany({
    where: { role: "client", createdAt: { gte: since, lt: until } },
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      profile: { select: { documentNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Cuentas encontradas: ${users.length}`);
  if (!apply) {
    console.log("Simulación: no se cambiaron contraseñas");
    process.exit(0);
  }

  const credentials = [];
  for (const user of users) {
    const password = `Wolf-${crypto.randomBytes(7).toString("base64url")}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(password, 10) },
    });
    credentials.push({ ...user, password });
  }

  const lines = [
    ["Nombres", "Apellidos", "DNI", "Teléfono", "Usuario", "Contraseña"],
    ...credentials.map((item) => [
      item.firstName,
      item.lastName,
      item.profile?.documentNumber || "",
      item.phoneNumber,
      item.username,
      item.password,
    ]),
  ].map((row) => row.map(csv).join(","));

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `\uFEFF${lines.join("\r\n")}\r\n`, {
    mode: 0o600,
  });
  console.log(`Credenciales emitidas: ${credentials.length}`);
  console.log(`Archivo: ${output}`);
} finally {
  await prisma.$disconnect();
}
