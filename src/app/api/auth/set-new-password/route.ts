import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/infrastructure/prisma/prisma";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const { token, newPassword } = await request.json();

    if (typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { message: "Enlace invalido o incompleto" },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return NextResponse.json(
        { message: "La nueva contrasena debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token.trim()) },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { message: "El enlace es invalido o ya expiro" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const consumed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, tokenHash: resetToken.tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });
      await tx.session.deleteMany({
        where: { userId: resetToken.userId },
      });
      return true;
    });
    if (!consumed) return NextResponse.json({ message: "El enlace es inválido o ya expiró" }, { status: 400 });

    return NextResponse.json({
      message: "Contrasena restablecida correctamente. Ya puedes iniciar sesion.",
    });
  } catch (error) {
    console.error("Error al restablecer contrasena:", error);
    return NextResponse.json(
      { message: "Error interno al restablecer la contrasena" },
      { status: 500 }
    );
  }
}
