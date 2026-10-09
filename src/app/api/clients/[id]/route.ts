import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/server/auth/authorization";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { datesInOrder, optionalClientDateSchema } from "@/server/validation/client-input";

/* ---------- Zod schema ---------- */
const clientUpdateSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio"),
  lastName: z.string().min(1, "El apellido es obligatorio"),
  plan: z.string().trim().min(1, "El plan es obligatorio").max(80),
  startDate: optionalClientDateSchema,
  endDate: optionalClientDateSchema,
  phone: z.string().optional().or(z.literal("")),
  emergencyPhone: z.string().optional().default(""),
  documentNumber: z.string().optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  social: z.string().trim().max(240).optional().default(""),
  image: z.string().trim().max(2048).nullable().optional(),
}).refine(value => datesInOrder(value.startDate, value.endDate), {
  message: "La fecha de fin debe ser igual o posterior al inicio",
  path: ["endDate"],
});

function normalizeDocument(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeWhatsappPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 9) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;
  return digits;
}

function buildCredentialMessage(username: string, password: string) {
  return `Wolf Gym - credenciales de acceso\n\nUsuario: ${username}\nContraseña: ${password}\n\nIngresa en: https://www.wolf-gym.com/auth/login\nPuedes cambiar tu contraseña desde tu perfil.`;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

/* ---------- PUT: actualizar cliente ---------- */
export async function PUT(
  req: NextRequest,
  // si ejecutas en Edge, params puede ser Promise; usa esta firma:
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAdmin(req);
    if (!access.authorized) return access.response;

    const { id } = await params; // 👈 importante en Edge runtime
    if (!id) {
      return NextResponse.json(
        { error: "El ID del cliente es inválido o no está presente" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validatedData = clientUpdateSchema.parse(body);
    const documentNumber = normalizeDocument(validatedData.documentNumber);
    if (documentNumber && documentNumber.length !== 8) {
      return NextResponse.json({ error: "El DNI debe tener 8 dígitos" }, { status: 400 });
    }

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { profile_id: id },
      select: { user_id: true },
    });
    if (!clientProfile) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Normaliza/valida teléfono si viene
    let phoneE164: string | null = null;
    if (validatedData.phone && validatedData.phone.trim() !== "") {
      const pn = parsePhoneNumberFromString(validatedData.phone, "PE");
      if (!pn?.isValid()) {
        return NextResponse.json(
          { error: "El teléfono principal no es válido" },
          { status: 400 }
        );
      }
      phoneE164 = pn.number;

      // Unicidad (excluye al mismo user)
      const phoneTaken = await prisma.user.findFirst({
        where: {
          phoneNumber: phoneE164,
          id: { not: clientProfile.user_id },
        },
        select: { id: true },
      });
      if (phoneTaken) {
        return NextResponse.json(
          { error: "El teléfono ya está registrado" },
          { status: 400 }
        );
      }
    }

    if (documentNumber) {
      const documentTaken = await prisma.clientProfile.findFirst({
        where: {
          documentNumber,
          user_id: { not: clientProfile.user_id },
        },
        select: { profile_id: true },
      });
      if (documentTaken) {
        return NextResponse.json(
          { error: "El DNI ya está registrado" },
          { status: 400 }
        );
      }
    }

    // Transacción
    const [updatedProfile, updatedUser] = await prisma.$transaction([
      prisma.clientProfile.update({
        where: { profile_id: id },
        data: {
          profile_first_name: validatedData.firstName,
          profile_last_name: validatedData.lastName,
          profile_plan: validatedData.plan,
          profile_start_date: validatedData.startDate ? new Date(validatedData.startDate) : null,
          profile_end_date: validatedData.endDate ? new Date(validatedData.endDate) : null,
          profile_phone: phoneE164 ?? null,
          profile_emergency_phone:
            validatedData.emergencyPhone?.trim() || null,
          profile_address: validatedData.address || null,
          profile_social: validatedData.social || null,
          documentNumber: documentNumber || null,
        },
      }),
      prisma.user.update({
        select: { id: true, username: true, firstName: true, lastName: true, phoneNumber: true, image: true, role: true },
        where: { id: clientProfile.user_id },
        data: {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          ...(validatedData.image !== undefined
            ? { image: validatedData.image || null }
            : {}),
          ...(phoneE164 ? { phoneNumber: phoneE164 } : {}),
        },
      }),
    ]);

    return NextResponse.json(
      { message: "Cliente actualizado con éxito", updatedProfile, updatedUser },
      { status: 200 }
    );
  } catch (error) {
    const conflict = error as { code?: string; meta?: { target?: unknown } };
    if (conflict?.code === "P2002") {
      const target = String(conflict.meta?.target || "");
      return NextResponse.json(
        { error: target.includes("document") ? "El DNI ya está registrado" : "El usuario o teléfono ya está registrado" },
        { status: 400 },
      );
    }
    console.error("Error al actualizar cliente:", error);
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/* ---------- DELETE: eliminar cliente ---------- */
export async function DELETE(
  req: NextRequest,
  // en Edge, params es Promise; hay que await
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAdmin(req);
    if (!access.authorized) return access.response;

    const { id } = await params; // 👈 importante en Edge runtime
    if (!id) {
      return NextResponse.json(
        { error: "El ID del cliente es inválido" },
        { status: 400 }
      );
    }

    const profile = await prisma.clientProfile.findUnique({
      where: { profile_id: id },
      select: { user_id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

      await prisma.$transaction(async (tx) => {
        const financialRecords = await Promise.all([
          tx.debtHistory.count({ where: { clientProfileId: id } }),
          tx.dailyDebt.count({ where: { clientProfileId: id } }),
          tx.paymentRecord.count({ where: { payer_user_id: profile.user_id } }),
          tx.purchase.count({ where: { customerId: profile.user_id } }),
          tx.cashSale.count({ where: { OR: [{ customerId: profile.user_id }, { cashierId: profile.user_id }] } }),
        ]);
        if (financialRecords.some(Boolean)) throw new Error("FINANCIAL_HISTORY");
      await tx.userContact.deleteMany({ where: { contact_user_id: profile.user_id } });
      await tx.userMembershipPlan.deleteMany({ where: { userId: profile.user_id } });
      await tx.emailVerification.deleteMany({ where: { userId: profile.user_id } });
      await tx.fingerprint.deleteMany({ where: { user_id: profile.user_id } });
      await tx.attendance.deleteMany({ where: { userId: profile.user_id } });
      await tx.clientProfile.deleteMany({ where: { profile_id: id } });
      await tx.user.delete({ where: { id: profile.user_id } });
    }, { maxWait: 20000, timeout: 120000 });

    return NextResponse.json(
      { message: "Cliente eliminado con éxito" },
      { status: 200 }
    );
    } catch (error) {
      if (error instanceof Error && error.message === "FINANCIAL_HISTORY") return NextResponse.json({ error: "El cliente tiene historial financiero y debe conservarse." }, { status: 409 });
      console.error("Error al eliminar cliente:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAdmin(req);
    if (!access.authorized) return access.response;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "credentials") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }

    const profile = await prisma.clientProfile.findUnique({
      where: { profile_id: id },
      select: {
        profile_phone: true,
        user: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!profile?.user) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const verifiedEmail = await prisma.emailVerification.findUnique({
      where: { userId: profile.user.id },
      select: { email: true, verified: true },
    });

    if (verifiedEmail?.verified) {
      return NextResponse.json(
        {
          ok: true,
          mode: "verified-email",
          username: profile.user.username,
          email: maskEmail(verifiedEmail.email),
          message:
            "Esta cuenta tiene un correo verificado. No se cambió la contraseña; el cliente debe usar ‘¿Olvidaste tu contraseña?’.",
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const password = `Wolf-${crypto.randomBytes(4).toString("hex")}`;
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: profile.user.id },
      data: { password: hashed },
    });

    const phone = normalizeWhatsappPhone(profile.profile_phone || profile.user.phoneNumber);
    const message = buildCredentialMessage(profile.user.username, password);

    return NextResponse.json(
      {
        ok: true,
        mode: "temporary-password",
        username: profile.user.username,
        password,
        phone,
        message,
        whatsappUrl: phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error al generar credenciales:", error);
    return NextResponse.json(
      { error: "No se pudieron generar las credenciales" },
      { status: 500 }
    );
  }
}
