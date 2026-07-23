import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_REPORT = "C:\\Users\\User\\Downloads\\Reporte_Clientes (2).xlsx";

const PLAN_MAP = new Map([
  ["BASICO", "Básico"],
  ["BASICA", "Básico"],
  ["BÁSICO", "Básico"],
  ["BÁSICA", "Básico"],
  ["MENSUAL", "Mensual"],
  ["PRO", "Pro"],
  ["ELITE", "Elite"],
]);

function parseArgs(argv) {
  const args = {
    file: DEFAULT_REPORT,
    cutoff: new Date(),
    apply: false,
    cleanup: true,
    import: true,
    forceFinance: false,
    pruneMissing: false,
    verbose: false,
    limit: 0,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--no-cleanup") args.cleanup = false;
    else if (arg === "--no-import") args.import = false;
    else if (arg === "--force-finance") args.forceFinance = true;
    else if (arg === "--prune-missing") args.pruneMissing = true;
    else if (arg === "--file") args.file = argv[++i];
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
    else if (arg === "--cutoff")
      args.cutoff = parseDateOnly(argv[++i], "cutoff");
    else if (arg.startsWith("--cutoff="))
      args.cutoff = parseDateOnly(arg.slice("--cutoff=".length), "cutoff");
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit="))
      args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("--")) {
      positionals.push(arg);
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  if (positionals.length) {
    const last = positionals.at(-1);
    const hasTrailingDate =
      /^\d{4}-\d{2}-\d{2}$/.test(last) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(last);
    if (hasTrailingDate && positionals.length > 1) {
      args.cutoff = parseDateOnly(last, "cutoff");
      args.file = positionals.slice(0, -1).join(" ");
    } else {
      args.file = positionals.join(" ");
    }
  }

  args.cutoff = startOfDate(args.cutoff);
  return args;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/migrate-client-report.mjs --file "C:\\ruta\\Reporte.xlsx"

Opciones:
  --apply             Aplica cambios reales. Sin esto solo simula.
  --no-cleanup        No borra clientes vencidos/de prueba de la base.
  --no-import         No importa clientes vigentes desde el Excel.
  --force-finance     Permite borrar candidatos con pagos/compras.
  --prune-missing     Borra clientes de la base que no estén vigentes en el Excel.
  --verbose           Muestra muestras de filas omitidas.
  --cutoff YYYY-MM-DD Fecha de corte. Por defecto: hoy.
  --limit N           Limita importaciones reales para una prueba controlada.
`);
}

function startOfDate(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseDateOnly(value, label = "date") {
  if (!value) throw new Error(`Falta valor para ${label}`);
  if (value instanceof Date) return value;
  const match = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }
  const latamMatch = String(value)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (latamMatch) {
    return new Date(
      Date.UTC(
        Number(latamMatch[3]),
        Number(latamMatch[2]) - 1,
        Number(latamMatch[1]),
      ),
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Fecha inválida para ${label}: ${value}`);
  return date;
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * MS_PER_DAY);
}

function dateKey(date) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `+51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return `+${digits}`;
  if (digits.length > 9 && digits.endsWith(digits.slice(-9)))
    return `+51${digits.slice(-9)}`;
  return null;
}

function normalizeDni(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizePlan(value) {
  const key = normalizeHeader(value);
  for (const [needle, plan] of PLAN_MAP) {
    if (key.includes(needle)) return plan;
  }
  return "Mensual";
}

function splitFullName(rawName) {
  const name = normalizeText(rawName).toUpperCase();
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 3) {
    return {
      firstName: parts.slice(2).join(" "),
      lastName: parts.slice(0, 2).join(" "),
    };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  return { firstName: parts[0] || "SIN NOMBRE", lastName: "" };
}

function makeUsername(firstName, phone, existing) {
  const baseName =
    normalizeText(firstName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "cliente";
  const suffix =
    String(phone ?? "")
      .replace(/\D/g, "")
      .slice(-6) || crypto.randomInt(100000, 999999);
  const base = `${baseName}wg${suffix}`;
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  existing.add(candidate);
  return candidate;
}

function xmlDecode(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  let eocd = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 66000);
    i -= 1
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No se encontró el índice ZIP del XLSX");

  const entries = new Map();
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("ZIP central directory inválido");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error(`ZIP local header inválido: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error(`Método ZIP no soportado (${method}) en ${name}`);

    entries.set(name.replace(/\\/g, "/"), content);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function attr(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? xmlDecode(match[1]) : "";
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  for (const match of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const item = match[0];
    const pieces = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
      xmlDecode(m[1]),
    );
    strings.push(pieces.join(""));
  }
  return strings;
}

function resolveSheetPath(entries) {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8");
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new Error("XLSX sin workbook.xml o relaciones");

  const sheet = workbook.match(/<sheet\b[^>]*>/)?.[0];
  const relId = sheet ? attr(sheet, "r:id") : "";
  if (!relId) return "xl/worksheets/sheet1.xml";

  for (const match of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const node = match[0];
    if (attr(node, "Id") === relId) {
      const target = attr(node, "Target").replace(/^\/+/, "");
      return path.posix.normalize(
        target.startsWith("xl/") ? target : `xl/${target}`,
      );
    }
  }
  return "xl/worksheets/sheet1.xml";
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowXml = rowMatch[1];
    const values = [];
    for (const cellMatch of rowXml.matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
      const cellNode = cellMatch[0];
      const cellBody = cellMatch[1];
      const ref = attr(cellNode, "r");
      const type = attr(cellNode, "t");
      const column = ref.replace(/\d+/g, "");
      const index = columnToIndex(column);
      const rawValue = cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inlineValue =
        cellBody.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      let value = "";
      if (type === "s") value = sharedStrings[Number(rawValue)] ?? "";
      else if (type === "inlineStr") value = xmlDecode(inlineValue);
      else value = xmlDecode(rawValue);
      values[index] = value;
    }
    rows.push(values.map((value) => value ?? ""));
  }
  return rows;
}

function columnToIndex(column) {
  let result = 0;
  for (const char of column) result = result * 26 + (char.charCodeAt(0) - 64);
  return result - 1;
}

function readXlsxRows(filePath) {
  const entries = readZipEntries(filePath);
  const sharedStrings = parseSharedStrings(
    entries.get("xl/sharedStrings.xml")?.toString("utf8"),
  );
  const sheetPath = resolveSheetPath(entries);
  const sheet = entries.get(sheetPath)?.toString("utf8");
  if (!sheet) throw new Error(`No se encontró la hoja ${sheetPath}`);
  return parseSheetRows(sheet, sharedStrings);
}

function cellDate(row, columnIndex) {
  const value = row[columnIndex];
  if (value === null || value === undefined || value === "") return null;
  if (/^\d+(\.\d+)?$/.test(String(value))) return excelSerialToDate(value);
  return parseDateOnly(value);
}

function parseReport(filePath, cutoff) {
  if (!fs.existsSync(filePath))
    throw new Error(`No existe el Excel: ${filePath}`);
  const rows = readXlsxRows(filePath);
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "NRO"),
  );
  if (headerIndex < 0)
    throw new Error("No se encontró la fila de cabecera del reporte");

  const headers = rows[headerIndex].map(normalizeHeader);
  const index = (name) => headers.indexOf(normalizeHeader(name));
  const columns = {
    reg: index("F.REGISTRO"),
    start: index("F.INICIO CONTRATO"),
    end: index("F.FIN CONTRATO"),
    name: index("CLIENTE DEL CONTRATO"),
    dni: index("DNI"),
    phone: index("CELULAR"),
    address: index("DIRECCION"),
    email: index("EMAIL"),
    service: index("SERVICIO"),
    balance: index("SALDO"),
  };

  for (const [name, value] of Object.entries(columns)) {
    if (
      value < 0 &&
      ["start", "end", "name", "phone", "service"].includes(name)
    ) {
      throw new Error(`Falta columna requerida en Excel: ${name}`);
    }
  }

  const active = [];
  const expired = [];
  const tests = [];
  const skipped = [];

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some((cell) => String(cell ?? "").trim())) continue;
    const rawName = row[columns.name];
    const fullName = normalizeText(rawName);
    const startDate = cellDate(row, columns.start);
    const endDate = cellDate(row, columns.end);
    const phone = normalizePhone(row[columns.phone]);
    const dni = normalizeDni(row[columns.dni]);
    const isTest =
      !fullName ||
      !startDate ||
      !endDate ||
      /(^|\s)(TEST|PRUEBA)(\s|$)/i.test(normalizeText(rawName));

    if (isTest) {
      tests.push({
        fullName,
        phone,
        dni,
        startDate,
        endDate,
        reason: "sin datos/fechas o prueba",
      });
      continue;
    }

    if (endDate < cutoff) {
      expired.push({ fullName, phone, dni, startDate, endDate });
      continue;
    }

    if (!phone) {
      skipped.push({ fullName, dni, reason: "teléfono inválido o vacío" });
      continue;
    }

    const { firstName, lastName } = splitFullName(rawName);
    active.push({
      fullName,
      firstName,
      lastName,
      phone,
      dni,
      startDate,
      endDate,
      plan: normalizePlan(row[columns.service]),
      debt: parseMoney(row[columns.balance]),
      address: normalizeText(row[columns.address]),
      email: normalizeText(row[columns.email]).toLowerCase(),
      documentNumber: dni,
    });
  }

  return { active, expired, tests, skipped };
}

async function getCleanupCandidates(prisma, cutoff, activePhones = null) {
  const baseReasons = [
    { profile: null },
    { profile: { is: { profile_end_date: { lt: cutoff } } } },
    { profile: { is: { profile_start_date: null } } },
    { profile: { is: { profile_end_date: null } } },
    { firstName: { in: ["", "Sin nombre"] } },
    { username: { contains: "test", mode: "insensitive" } },
    { username: { contains: "prueba", mode: "insensitive" } },
    { firstName: { contains: "test", mode: "insensitive" } },
    { firstName: { contains: "prueba", mode: "insensitive" } },
    { lastName: { contains: "test", mode: "insensitive" } },
    { lastName: { contains: "prueba", mode: "insensitive" } },
  ];
  if (activePhones?.size) {
    baseReasons.push({ phoneNumber: { notIn: [...activePhones] } });
  }

  const candidates = await prisma.user.findMany({
    where: {
      role: "client",
      OR: baseReasons,
    },
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      profile: {
        select: {
          profile_id: true,
          profile_start_date: true,
          profile_end_date: true,
        },
      },
      _count: {
        select: {
          payments: true,
          purchases: true,
          attendances: true,
          fingerprints: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return candidates.map((candidate) => {
    const reasons = [];
    if (!candidate.profile) reasons.push("sin perfil");
    if (
      candidate.profile?.profile_end_date &&
      candidate.profile.profile_end_date < cutoff
    )
      reasons.push("vencido");
    if (candidate.profile && !candidate.profile.profile_start_date)
      reasons.push("sin inicio");
    if (candidate.profile && !candidate.profile.profile_end_date)
      reasons.push("sin fin");
    if (
      /test|prueba/i.test(
        `${candidate.username} ${candidate.firstName} ${candidate.lastName}`,
      )
    )
      reasons.push("prueba");
    if (activePhones?.size && !activePhones.has(candidate.phoneNumber))
      reasons.push("no está en Excel vigente");
    return { ...candidate, reasons };
  });
}

async function deleteCandidates(prisma, candidates, { forceFinance }) {
  const skippedFinance = candidates.filter((item) => {
    return (
      !forceFinance && (item._count.payments > 0 || item._count.purchases > 0)
    );
  });
  const deletable = candidates.filter(
    (item) => !skippedFinance.some((skip) => skip.id === item.id),
  );
  const ids = deletable.map((item) => item.id);
  const profileIds = deletable
    .map((item) => item.profile?.profile_id)
    .filter(Boolean);

  if (!ids.length) return { deletedUsers: 0, skippedFinance };

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.debtHistory.deleteMany({
        where: { clientProfileId: { in: profileIds } },
      });
      await tx.dailyDebt.deleteMany({
        where: { clientProfileId: { in: profileIds } },
      });
      await tx.paymentRecord.deleteMany({
        where: { payer_user_id: { in: ids } },
      });
      await tx.purchase.deleteMany({ where: { customerId: { in: ids } } });
      await tx.userContact.deleteMany({
        where: { contact_user_id: { in: ids } },
      });
      await tx.userMembershipPlan.deleteMany({
        where: { userId: { in: ids } },
      });
      await tx.emailVerification.deleteMany({ where: { userId: { in: ids } } });
      await tx.session.deleteMany({ where: { userId: { in: ids } } });
      await tx.account.deleteMany({ where: { userId: { in: ids } } });
      const deletedFingerprints = await tx.fingerprint.deleteMany({
        where: { user_id: { in: ids } },
      });
      await tx.attendance.deleteMany({ where: { userId: { in: ids } } });
      await tx.clientProfile.deleteMany({ where: { user_id: { in: ids } } });
      const deleted = await tx.user.deleteMany({ where: { id: { in: ids } } });
      return {
        deletedUsers: deleted.count,
        deletedFingerprints: deletedFingerprints.count,
      };
    },
    { maxWait: 20000, timeout: 120000 },
  );

  return { ...result, skippedFinance };
}

async function importClients(prisma, clients, { apply, limit }) {
  const existingUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      profile: { select: { documentNumber: true } },
    },
  });
  const usernameSet = new Set(existingUsers.map((user) => user.username));
  const byPhone = new Map(
    existingUsers.map((user) => [user.phoneNumber, user]),
  );
  const usersByDni = new Map();
  for (const user of existingUsers) {
    const dni = normalizeDni(user.profile?.documentNumber);
    if (!dni) continue;
    const matches = usersByDni.get(dni) || [];
    matches.push(user);
    usersByDni.set(dni, matches);
  }
  const byDni = new Map(
    [...usersByDni.entries()]
      .filter(([, matches]) => matches.length === 1)
      .map(([dni, matches]) => [dni, matches[0]]),
  );
  const rows = limit > 0 ? clients.slice(0, limit) : clients;

  let create = 0;
  let update = 0;
  let matchedByDni = 0;
  let matchedByPhone = 0;
  let conflicts = 0;

  const resolveExisting = (client) => {
    const dniMatch = client.dni ? byDni.get(client.dni) : null;
    const phoneMatch = byPhone.get(client.phone);
    if (dniMatch && phoneMatch && dniMatch.id !== phoneMatch.id) {
      return { existing: null, conflict: true, match: "conflict" };
    }
    if (dniMatch) return { existing: dniMatch, conflict: false, match: "dni" };
    if (phoneMatch)
      return { existing: phoneMatch, conflict: false, match: "phone" };
    return { existing: null, conflict: false, match: "new" };
  };

  for (const client of rows) {
    const resolved = resolveExisting(client);
    if (resolved.conflict) conflicts += 1;
    else if (resolved.existing) {
      update += 1;
      if (resolved.match === "dni") matchedByDni += 1;
      else matchedByPhone += 1;
    } else create += 1;
  }

  if (!apply) {
    return {
      create,
      update,
      processed: rows.length,
      matchedByDni,
      matchedByPhone,
      conflicts,
    };
  }

  for (const client of rows) {
    const resolved = resolveExisting(client);
    if (resolved.conflict) continue;
    const existing = resolved.existing;
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: client.firstName,
          lastName: client.lastName,
          phoneNumber: client.phone,
          profile: {
            upsert: {
              create: {
                profile_first_name: client.firstName,
                profile_last_name: client.lastName,
                profile_plan: client.plan,
                profile_start_date: client.startDate,
                profile_end_date: client.endDate,
                profile_phone: client.phone,
                profile_address: client.address,
                profile_social: client.email,
                documentNumber: client.documentNumber || null,
                debt: client.debt,
              },
              update: {
                profile_first_name: client.firstName,
                profile_last_name: client.lastName,
                profile_plan: client.plan,
                profile_start_date: client.startDate,
                profile_end_date: client.endDate,
                profile_phone: client.phone,
                profile_address: client.address,
                profile_social: client.email,
                documentNumber: client.documentNumber || null,
                debt: client.debt,
              },
            },
          },
        },
      });
      byPhone.delete(existing.phoneNumber);
      const updatedUser = { ...existing, phoneNumber: client.phone };
      byPhone.set(client.phone, updatedUser);
      if (client.dni) byDni.set(client.dni, updatedUser);
      continue;
    }

    const password = crypto.randomBytes(9).toString("base64url");
    const hashed = await bcrypt.hash(password, 10);
    const username = makeUsername(client.firstName, client.phone, usernameSet);
    const created = await prisma.user.create({
      data: {
        username,
        firstName: client.firstName,
        lastName: client.lastName,
        password: hashed,
        role: "client",
        phoneNumber: client.phone,
        profile: {
          create: {
            profile_first_name: client.firstName,
            profile_last_name: client.lastName,
            profile_plan: client.plan,
            profile_start_date: client.startDate,
            profile_end_date: client.endDate,
            profile_phone: client.phone,
            profile_address: client.address,
            profile_social: client.email,
            documentNumber: client.documentNumber || null,
            debt: client.debt,
          },
        },
      },
      select: { id: true, username: true, phoneNumber: true },
    });
    byPhone.set(created.phoneNumber, created);
    if (client.dni) byDni.set(client.dni, created);
  }

  return {
    create,
    update,
    processed: rows.length,
    matchedByDni,
    matchedByPhone,
    conflicts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = parseReport(args.file, args.cutoff);
  const prisma = new PrismaClient();

  console.log("=== WolfGym migración de clientes ===");
  console.log(`Archivo: ${args.file}`);
  console.log(`Fecha de corte: ${dateKey(args.cutoff)}`);
  console.log(
    `Modo: ${args.apply ? "APLICAR CAMBIOS" : "SIMULACIÓN (dry-run)"}`,
  );
  console.log("");
  console.log("Excel:");
  console.log(`  Vigentes importables: ${report.active.length}`);
  console.log(`  Vencidos en Excel:    ${report.expired.length}`);
  console.log(`  Prueba/sin fechas:    ${report.tests.length}`);
  console.log(`  Omitidos:             ${report.skipped.length}`);
  if (args.verbose) {
    for (const item of report.skipped.slice(0, 10)) {
      console.log(
        `  omitido: ${item.fullName || item.dni || "sin nombre"} | ${item.reason}`,
      );
    }
    for (const item of report.tests.slice(0, 10)) {
      console.log(
        `  prueba:  ${item.fullName || item.dni || "sin nombre"} | ${item.reason}`,
      );
    }
  }

  try {
    if (args.cleanup) {
      const activePhones = args.pruneMissing
        ? new Set(report.active.map((client) => client.phone))
        : null;
      const candidates = await getCleanupCandidates(
        prisma,
        args.cutoff,
        activePhones,
      );
      const withFinance = candidates.filter(
        (item) => item._count.payments > 0 || item._count.purchases > 0,
      );
      const fingerprintCount = candidates.reduce(
        (total, item) => total + item._count.fingerprints,
        0,
      );
      console.log("");
      console.log("Base de datos:");
      console.log(`  Candidatos a borrar:  ${candidates.length}`);
      console.log(`  Huellas asociadas:    ${fingerprintCount}`);
      console.log(
        `  Con pagos/compras:    ${withFinance.length}${withFinance.length && !args.forceFinance ? " (se omiten sin --force-finance)" : ""}`,
      );
      for (const item of candidates.slice(0, 10)) {
        const name =
          `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() ||
          item.username;
        const end = item.profile?.profile_end_date
          ? dateKey(item.profile.profile_end_date)
          : "sin fecha";
        console.log(
          `  - ${name} | ${item.phoneNumber} | ${end} | ${item.reasons.join(", ")}`,
        );
      }
      if (args.apply) {
        const deleted = await deleteCandidates(prisma, candidates, args);
        console.log(`  Borrados realmente:   ${deleted.deletedUsers}`);
        console.log(`  Huellas borradas:     ${deleted.deletedFingerprints}`);
        if (deleted.skippedFinance.length)
          console.log(
            `  Omitidos por finanza: ${deleted.skippedFinance.length}`,
          );
      }
    }

    if (args.import) {
      const result = await importClients(prisma, report.active, args);
      console.log("");
      console.log("Importación:");
      console.log(`  Procesados: ${result.processed}`);
      console.log(`  Crear:      ${result.create}`);
      console.log(`  Actualizar: ${result.update}`);
      console.log(`    por DNI:  ${result.matchedByDni}`);
      console.log(`    por tel.: ${result.matchedByPhone}`);
      console.log(`  Conflictos: ${result.conflicts}`);
      if (!args.apply)
        console.log("  No se escribió nada. Ejecuta con --apply para aplicar.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
