import crypto from "crypto";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import prisma from "@/infrastructure/prisma/prisma";

const registerSchema = z.object({
  firstname: z.string().trim().min(1, "El nombre es obligatorio"),
  lastname: z.string().trim().min(1, "El apellido es obligatorio"),
  username: z
    .string()
    .trim()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(40, "El usuario no debe superar 40 caracteres")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "El usuario solo puede usar letras, números, punto, guion y guion bajo",
    ),
  email: z
    .string()
    .trim()
    .email("Ingresa un email válido")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().min(6, "El teléfono es obligatorio"),
  emergencyPhone: z.string().trim().optional().or(z.literal("")),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

function normalizeEmail(email?: string) {
  const value = email?.trim().toLowerCase();
  return value || null;
}

function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, "");
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const parsed = registerSchema.safeParse(await req.json());

    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || "Datos inválidos");
    }

    const firstname = parsed.data.firstname;
    const lastname = parsed.data.lastname;
    const username = parsed.data.username;
    const phone = normalizePhone(parsed.data.phone);
    const emergencyPhone = parsed.data.emergencyPhone
      ? normalizePhone(parsed.data.emergencyPhone)
      : null;
    const email = normalizeEmail(parsed.data.email);

    const [existingUser, existingPhone, existingEmail] = await Promise.all([
      prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { phoneNumber: phone },
        select: { id: true },
      }),
      email
        ? prisma.emailVerification.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { userId: true },
          })
        : Promise.resolve(null),
    ]);

    if (existingUser) return badRequest("El usuario ya está registrado");
    if (existingPhone) return badRequest("El teléfono ya está registrado");
    if (existingEmail) return badRequest("El email ya está registrado");

    if (email) {
      const emailAsUsername = await prisma.user.findFirst({
        where: { username: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });

      if (emailAsUsername) return badRequest("El email ya está registrado");
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName: firstname,
          username,
          lastName: lastname,
          password: hashedPassword,
          role: "client",
          phoneNumber: phone,
          profile: {
            create: {
              profile_first_name: firstname,
              profile_last_name: lastname,
              profile_phone: phone,
              profile_emergency_phone: emergencyPhone,
            },
          },
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });

      if (email) {
        await tx.emailVerification.create({
          data: {
            userId: createdUser.id,
            email,
            code: crypto.randomInt(100000, 999999).toString(),
            token: crypto.randomBytes(32).toString("hex"),
            verified: false,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
      }

      return createdUser;
    });

    return NextResponse.json(
      { message: "Usuario registrado con éxito", user },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("ERROR EN REGISTRO:", error);

    if ((error as { code?: string }).code === "P2002") {
      return badRequest("Ya existe una cuenta con esos datos");
    }

    return NextResponse.json(
      { message: "Error en el registro. Inténtalo nuevamente." },
      { status: 500 },
    );
  }
}
