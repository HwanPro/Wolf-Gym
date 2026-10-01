import fs from "node:fs";

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const sourceEnv = dotenv.parse(fs.readFileSync(".env"));
const localEnv = dotenv.parse(fs.readFileSync(".env.local"));
const sourceUrl = sourceEnv.DATABASE_URL;
const localUrl = localEnv.DATABASE_URL;

if (!sourceUrl || !localUrl) {
  throw new Error("Falta DATABASE_URL en .env o .env.local.");
}

if (sourceUrl === localUrl) {
  throw new Error("La base de origen y la base local no pueden ser la misma.");
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const local = new PrismaClient({ datasources: { db: { url: localUrl } } });

const ADMIN_USERNAME = "codex_admin";
const TEST_PASSWORD = process.env.TEST_CLIENT_PASSWORD || "Prueba123!";

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function main() {
  const admin = await source.user.findUnique({
    where: { username: ADMIN_USERNAME },
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      image: true,
      role: true,
      password: true,
      firstName: true,
      lastName: true,
      createdAt: true,
    },
  });

  if (!admin || admin.role !== "admin" || !admin.password) {
    throw new Error(`No se encontró el administrador ${ADMIN_USERNAME} con contraseña.`);
  }

  await local.user.deleteMany({
    where: { username: "AZRAEL", phoneNumber: "+51900000001" },
  });

  await local.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {
      phoneNumber: admin.phoneNumber,
      image: admin.image,
      role: "admin",
      password: admin.password,
      firstName: admin.firstName,
      lastName: admin.lastName,
      otpCode: null,
      twoFASecret: null,
    },
    create: {
      id: admin.id,
      username: admin.username,
      phoneNumber: admin.phoneNumber,
      image: admin.image,
      role: "admin",
      password: admin.password,
      firstName: admin.firstName,
      lastName: admin.lastName,
      createdAt: admin.createdAt,
      otpCode: null,
      twoFASecret: null,
    },
  });

  const password = await bcrypt.hash(TEST_PASSWORD, 12);
  const today = new Date();
  const startDate = addDays(today, -7);
  const endDate = addDays(today, 23);

  for (let index = 1; index <= 10; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const username = `prueba${suffix}`;
    const phone = `+519100000${suffix}`;
    const documentNumber = `790000${suffix}`;

    const user = await local.user.upsert({
      where: { username },
      update: {
        phoneNumber: phone,
        password,
        role: "client",
        firstName: `Cliente ${suffix}`,
        lastName: "Prueba Wolf Gym",
        otpCode: null,
        twoFASecret: null,
      },
      create: {
        username,
        phoneNumber: phone,
        password,
        role: "client",
        firstName: `Cliente ${suffix}`,
        lastName: "Prueba Wolf Gym",
      },
    });

    await local.clientProfile.upsert({
      where: { user_id: user.id },
      update: {
        profile_plan: index <= 5 ? "Plan Mes" : "Plan Pro",
        profile_start_date: startDate,
        profile_end_date: endDate,
        profile_phone: phone,
        profile_emergency_phone: "+51919999999",
        documentNumber,
        profile_first_name: `Cliente ${suffix}`,
        profile_last_name: "Prueba Wolf Gym",
        debt: index % 4 === 0 ? 20 : 0,
      },
      create: {
        user_id: user.id,
        profile_plan: index <= 5 ? "Plan Mes" : "Plan Pro",
        profile_start_date: startDate,
        profile_end_date: endDate,
        profile_phone: phone,
        profile_emergency_phone: "+51919999999",
        profile_address: "Datos locales de prueba",
        documentNumber,
        profile_first_name: `Cliente ${suffix}`,
        profile_last_name: "Prueba Wolf Gym",
        debt: index % 4 === 0 ? 20 : 0,
      },
    });
  }

  const [admins, testClients] = await Promise.all([
    local.user.count({ where: { role: "admin" } }),
    local.user.count({ where: { username: { startsWith: "prueba" } } }),
  ]);

  console.log(`Administrador local migrado: ${ADMIN_USERNAME}`);
  console.log(`Clientes locales de prueba: ${testClients}`);
  console.log(`Administradores locales: ${admins}`);
  console.log(`Contraseña compartida de pruebas: ${TEST_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error preparando datos locales.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([source.$disconnect(), local.$disconnect()]);
  });
