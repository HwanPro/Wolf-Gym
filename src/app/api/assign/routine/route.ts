import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para asignar rutina
const assignRoutineSchema = z.object({
  userId: z.string().min(1, "El ID del usuario es requerido"),
  routineTemplateId: z.string().min(1, "El ID de la rutina es requerido"),
  weekDay: z.number().min(0).max(6), // 0 = domingo, 6 = sábado
  active: z.boolean().default(true),
  notes: z.string().optional()
});

// POST - Asignar rutina a usuario para un día específico
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = assignRoutineSchema.parse(body);

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

    // Verificar que la rutina existe y está publicada
    const routine = await prisma.routineTemplate.findUnique({
      where: { id: data.routineTemplateId }
    });

    if (!routine || !routine.isPublished) {
      return NextResponse.json(
        { error: "Rutina no encontrada o no publicada" },
        { status: 404 }
      );
    }

    // Verificar si ya existe una asignación para ese día
    const existingAssignment = await prisma.userRoutineAssignment.findUnique({
      where: {
        userId_routineTemplateId_weekDay: {
          userId: data.userId,
          routineTemplateId: data.routineTemplateId,
          weekDay: data.weekDay
        }
      }
    });

    if (existingAssignment) {
      // Actualizar asignación existente
      await prisma.userRoutineAssignment.update({
        where: {
          userId_routineTemplateId_weekDay: {
            userId: data.userId,
            routineTemplateId: data.routineTemplateId,
            weekDay: data.weekDay
          }
        },
        data: {
          active: data.active,
          notes: data.notes
        }
      });
    } else {
      // Crear nueva asignación
      await prisma.userRoutineAssignment.create({
        data
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al asignar rutina:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
