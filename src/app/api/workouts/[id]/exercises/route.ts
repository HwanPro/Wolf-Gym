import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para agregar ejercicio a entrenamiento
const addWorkoutExerciseSchema = z.object({
  exerciseId: z.string().min(1, "El ID del ejercicio es requerido"),
  order: z.number().min(1).optional(),
  targetSets: z.number().min(1).optional(),
  targetRepsRange: z.object({
    min: z.number().min(1),
    max: z.number().min(1)
  }).optional(),
  targetRestSec: z.number().min(0).optional(),
  notes: z.string().optional()
});

// POST - Agregar ejercicio a entrenamiento
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const data = addWorkoutExerciseSchema.parse(body);

    // Verificar que el entrenamiento existe y pertenece al usuario
    const workout = await prisma.workoutSession.findUnique({
      where: { id: (await params).id }
    });

    if (!workout || workout.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Entrenamiento no encontrado" },
        { status: 404 }
      );
    }

    if (workout.status === 'completed') {
      return NextResponse.json(
        { error: "No se puede modificar un entrenamiento completado" },
        { status: 400 }
      );
    }

    // Verificar que el ejercicio existe y está publicado
    const exercise = await prisma.exercise.findUnique({
      where: { id: data.exerciseId }
    });

    if (!exercise || !exercise.isPublished) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Si no se especifica order, usar el siguiente disponible
    let order = data.order;
    if (!order) {
      const lastExercise = await prisma.workoutExercise.findFirst({
        where: { workoutSessionId: (await params).id },
        orderBy: { order: 'desc' }
      });
      order = (lastExercise?.order || 0) + 1;
    }

    const workoutExercise = await prisma.workoutExercise.create({
      data: {
        workoutSessionId: (await params).id,
        exerciseId: data.exerciseId,
        order,
        targetSets: data.targetSets,
        targetRepsMin: data.targetRepsRange?.min,
        targetRepsMax: data.targetRepsRange?.max,
        targetRestSec: data.targetRestSec,
        notes: data.notes
      }
    });

    return NextResponse.json({ id: workoutExercise.id });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al agregar ejercicio a entrenamiento:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET - Obtener ejercicios de un entrenamiento
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que el entrenamiento existe y pertenece al usuario
    const workout = await prisma.workoutSession.findUnique({
      where: { id: (await params).id }
    });

    if (!workout || workout.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Entrenamiento no encontrado" },
        { status: 404 }
      );
    }

    const exercises = await prisma.workoutExercise.findMany({
      where: { workoutSessionId: (await params).id },
      include: {
        exercise: {
          include: {
            media: {
              where: { isCover: true },
              take: 1
            }
          }
        },
        sets: {
          orderBy: { setIndex: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json(exercises);

  } catch (error) {
    console.error("Error al obtener ejercicios de entrenamiento:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
