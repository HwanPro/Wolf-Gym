// /api/auth/change-password/route.ts
import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "No autenticado" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return NextResponse.json(
        { message: "Completa la contraseña actual y la nueva contraseña" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return NextResponse.json(
        { message: "La nueva contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { message: "La nueva contraseña debe ser diferente a la actual" },
        { status: 400 }
      );
    }

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return NextResponse.json(
        { message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { message: "Esta cuenta no tiene una contraseña local configurada" },
        { status: 400 }
      );
    }

    // Verificar contraseña actual
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return NextResponse.json(
        { message: "Contraseña actual incorrecta" },
        { status: 400 }
      );
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { password: hashedPassword },
      }),
      prisma.session.deleteMany({
        where: { userId: session.user.id },
      }),
    ]);

    // Enviar correo de confirmación
    // sendPasswordChangedEmail(user.email, ...);

    return NextResponse.json({ message: "Contraseña actualizada" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  }
}
