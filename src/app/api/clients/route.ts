// src/app/api/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { z, ZodError } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getToken } from "next-auth/jwt";

/* ========= helpers ========= */
const PlanSchema = z.string().trim().min(1).max(80);

const ProfileSchema = z.object({
  plan: PlanSchema,
  startDate: z.preprocess(
    (v) => (v === "" ? null : (v ?? null)),
    z.string().nullable(),
  ),
  endDate: z.preprocess(
    (v) => (v === "" ? null : (v ?? null)),
    z.string().nullable(),
  ),
  emergencyPhone: z.preprocess(
    (v) => (v === "" ? null : (v ?? null)),
    z.string().nullable(),
  ),
  address: z.string().default(""),
  social: z.string().default(""),
  documentNumber: z.string().optional().default(""),
  debt: z.number().min(0).default(0),
});

const BodySchema = z.object({
  username: z.string().min(3, { message: "Usuario requerido" }),
  // puede venir vacío: si no mandas, el backend autogenera
  password: z.string().optional().default(""),
  phoneNumber: z.string().min(6, { message: "Teléfono inválido" }),
  firstName: z.string().min(1, { message: "Nombre requerido" }),
  lastName: z.string().min(1, { message: "Apellido requerido" }),
  profile: ProfileSchema,
});

/* ========= GET ========= */
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  try {
    const clients = await prisma.clientProfile.findMany({
      orderBy: { profile_start_date: "desc" },
      select: {
        profile_id: true,
        user_id: true,
        profile_first_name: true,
        profile_last_name: true,
        profile_plan: true,
        profile_start_date: true,
        profile_end_date: true,
        profile_phone: true,
        profile_emergency_phone: true,
        profile_address: true,
        profile_social: true,
        documentNumber: true,
        user: {
          select: {
            id: true,
            role: true,
            username: true,
            createdAt: true,
            fingerprints: { select: { id: true }, take: 1 },
            attendances: {
              select: { checkInTime: true, channel: true },
              orderBy: { checkInTime: "desc" },
            },
          },
        },
      },
    });
    return NextResponse.json(clients, { status: 200 });
  } catch (err) {
    console.error("GET /api/clients error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

/* ========= POST ========= */
export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  try {
    const raw = await request.json();

    // Normaliza entrada plana o anidada
    const isNested =
      raw &&
      typeof raw === "object" &&
      raw.profile &&
      typeof raw.profile === "object";
    const username = raw?.username ?? raw?.userName ?? "";
    const password = raw?.password ?? ""; // puede venir vacío
    const firstName = raw?.firstName ?? raw?.profile_first_name ?? "";
    const lastName = raw?.lastName ?? raw?.profile_last_name ?? "";
    const phoneNumber = raw?.phoneNumber ?? raw?.phone ?? "";

    const baseProfile = isNested
      ? {
          plan: raw.profile?.plan,
          startDate: raw.profile?.startDate,
          endDate: raw.profile?.endDate,
          emergencyPhone: raw.profile?.emergencyPhone,
          address: raw.profile?.address ?? "",
          social: raw.profile?.social ?? "",
          documentNumber: raw.profile?.documentNumber ?? raw.profile?.dni ?? "",
          debt: Number(raw.profile?.debt ?? 0),
        }
      : {
          plan: raw?.plan,
          startDate: raw?.membershipStart,
          endDate: raw?.membershipEnd,
          emergencyPhone: raw?.emergencyPhone,
          address: raw?.address ?? raw?.profile_address ?? "",
          social: raw?.social ?? raw?.profile_social ?? "",
          documentNumber: raw?.documentNumber ?? raw?.dni ?? "",
          debt: Number(raw?.debt ?? 0),
        };

    const plan =
      typeof baseProfile.plan === "string" && baseProfile.plan.trim()
        ? baseProfile.plan.trim()
        : "Plan Mes";

    const body = BodySchema.parse({
      username,
      password,
      phoneNumber,
      firstName,
      lastName,
      profile: { ...baseProfile, plan },
    });
    const documentNumber = String(body.profile.documentNumber || "").replace(
      /\D/g,
      "",
    );
    if (documentNumber && documentNumber.length !== 8) {
      return NextResponse.json(
        { error: "El DNI debe tener 8 dígitos" },
        { status: 400 },
      );
    }

    // Normaliza teléfonos a E.164 (PE)
    const main = parsePhoneNumberFromString(body.phoneNumber, "PE");
    if (!main?.isValid()) {
      return NextResponse.json(
        { error: "El teléfono principal no es válido" },
        { status: 400 },
      );
    }
    const phoneE164 = main.number;

    let emergencyE164: string | null = null;
    if (body.profile.emergencyPhone) {
      const emerg = parsePhoneNumberFromString(
        body.profile.emergencyPhone,
        "PE",
      );
      if (emerg && !emerg.isValid()) {
        return NextResponse.json(
          { error: "El teléfono de emergencia no es válido" },
          { status: 400 },
        );
      }
      emergencyE164 = emerg ? emerg.number : null;
    }

    // Unicidad
    const [uByUsername, uByPhone, profileByDocument] = await Promise.all([
      prisma.user.findUnique({
        where: { username: body.username },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { phoneNumber: phoneE164 },
        select: { id: true },
      }),
      documentNumber
        ? prisma.clientProfile.findFirst({
            where: { documentNumber },
            select: { profile_id: true },
          })
        : Promise.resolve(null),
    ]);
    if (uByUsername)
      return NextResponse.json(
        { error: "El usuario ya está registrado" },
        { status: 400 },
      );
    if (uByPhone)
      return NextResponse.json(
        { error: "El teléfono ya está registrado" },
        { status: 400 },
      );
    if (profileByDocument)
      return NextResponse.json(
        { error: "El DNI ya está registrado" },
        { status: 400 },
      );

    // Password: usa la enviada si viene y es >= 6; si no, genera una
    const finalRawPassword =
      body.password && body.password.length >= 6
        ? body.password
        : crypto.randomBytes(6).toString("hex");
    const hashed = await bcrypt.hash(finalRawPassword, 10);

    // Transacción
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: body.username,
          firstName: body.firstName,
          lastName: body.lastName,
          password: hashed,
          role: "client",
          phoneNumber: phoneE164,
        },
      });

      const profile = await tx.clientProfile.create({
        data: {
          user: { connect: { id: user.id } },
          profile_first_name: body.firstName,
          profile_last_name: body.lastName,
          profile_plan: body.profile.plan,
          profile_start_date: body.profile.startDate
            ? new Date(body.profile.startDate)
            : null,
          profile_end_date: body.profile.endDate
            ? new Date(body.profile.endDate)
            : null,
          profile_phone: phoneE164,
          profile_emergency_phone: emergencyE164,
          profile_address: body.profile.address ?? "",
          profile_social: body.profile.social ?? "",
          documentNumber: documentNumber || null,
          debt: body.profile.debt,
        },
      });

      return { user, profile };
    });

    return NextResponse.json(
      {
        message: "Cliente registrado con éxito",
        tempPassword: finalRawPassword,
        userId: result.user.id,
        profileId: result.profile.profile_id,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      console.error("Zod error /api/clients:", JSON.stringify(err.issues));
      return NextResponse.json(
        { error: "Datos inválidos", details: err.issues },
        { status: 400 },
      );
    }
    const prismaError = err as { code?: string; meta?: { target?: unknown } };
    if (prismaError?.code === "P2002") {
      const target = prismaError.meta?.target;
      const t = Array.isArray(target)
        ? target.map(String).join(",")
        : String(target || "");
      const msg = t.includes("username")
        ? "El usuario ya está registrado"
        : t.includes("phoneNumber")
          ? "El teléfono ya está registrado"
          : "Registro duplicado";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("POST /api/clients error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
