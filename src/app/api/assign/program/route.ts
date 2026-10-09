import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para asignar programa
const assignProgramSchema = z.object({
  userId: z.string().min(1, "El ID del usuario es requerido"),
  programId: z.string().min(1, "El ID del programa es requerido"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  active: z.boolean().default(true),
  notes: z.string().optional()
});

// POST - Asignar programa a usuario
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = assignProgramSchema.parse(body);

    // Verificar que el usuario existe
    const user = await prisma.user.findUnique({
      where: { id: data.userId }
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que el programa existe y está publicado
    const program = await prisma.programTemplate.findUnique({
      where: { id: data.programId }
    });

    if (!program || !program.isPublished) {
      return NextResponse.json(
        { error: "Programa no encontrado o no publicado" },
        { status: 404 }
      );
    }

    // Desactivar asignaciones previas del mismo programa
    await prisma.userProgramAssignment.updateMany({
      where: {
        userId: data.userId,
        programId: data.programId,
        active: true
      },
      data: { active: false }
    });

    // Crear nueva asignación
    const assignment = await prisma.userProgramAssignment.create({
      data: {
        userId: data.userId,
        programId: data.programId,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        active: data.active,
        notes: data.notes
      }
    });

    return NextResponse.json({
      success: true,
      assignmentId: `${assignment.userId}-${assignment.programId}`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al asignar programa:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
