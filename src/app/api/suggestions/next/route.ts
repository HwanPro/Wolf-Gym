import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET - Obtener sugerencia de progresión para un ejercicio
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const exerciseId = searchParams.get("exerciseId");

    if (!exerciseId) {
      return NextResponse.json(
        { error: "Se requiere el ID del ejercicio" },
        { status: 400 }
      );
    }

    // Verificar que el ejercicio existe
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId }
    });

    if (!exercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Buscar sugerencia existente
    const suggestion = await prisma.exerciseProgressSuggestion.findUnique({
      where: {
        userId_exerciseId: {
          userId: session.user.id,
          exerciseId
        }
      }
    });

    if (suggestion) {
      return NextResponse.json({
        exerciseId,
        exerciseName: exercise.name,
        suggestedWeight: suggestion.suggestedWeight,
        suggestedRepsMin: suggestion.suggestedRepsMin,
        suggestedRepsMax: suggestion.suggestedRepsMax,
        rationale: suggestion.rationale,
        lastUpdated: suggestion.updatedAt
      });
    }

    // Si no hay sugerencia, buscar el último entrenamiento de este ejercicio
    const lastWorkoutSet = await prisma.workoutSet.findFirst({
      where: {
        workoutExercise: {
          exerciseId,
          workoutSession: {
            userId: session.user.id,
            status: 'completed'
          }
        },
        isWarmup: false
      },
      include: {
        workoutExercise: {
          include: {
            workoutSession: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    if (lastWorkoutSet) {
      // Generar sugerencia básica basada en el último entrenamiento
      let suggestedWeight = lastWorkoutSet.weight;
      let rationale = "Peso del último entrenamiento";

      // Si hizo más de 10 reps, sugerir aumento
      if (lastWorkoutSet.reps >= 10) {
        suggestedWeight = lastWorkoutSet.weight * 1.025; // +2.5%
        rationale = "Aumentar peso por alto número de repeticiones en la última sesión";
      }

      return NextResponse.json({
        exerciseId,
        exerciseName: exercise.name,
        suggestedWeight: Math.round(suggestedWeight * 4) / 4, // Redondear a 0.25kg
        suggestedRepsMin: exercise.defaultRepMin || 8,
        suggestedRepsMax: exercise.defaultRepMax || 12,
        rationale,
        lastUpdated: new Date(),
        basedOnLastWorkout: {
          weight: lastWorkoutSet.weight,
          reps: lastWorkoutSet.reps,
          date: lastWorkoutSet.workoutExercise.workoutSession.date
        }
      });
    }

    // Si no hay historial, usar valores por defecto del ejercicio
    return NextResponse.json({
      exerciseId,
      exerciseName: exercise.name,
      suggestedWeight: null,
      suggestedRepsMin: exercise.defaultRepMin || 8,
      suggestedRepsMax: exercise.defaultRepMax || 12,
      rationale: "Primera vez realizando este ejercicio - usar peso cómodo",
      lastUpdated: new Date(),
      isFirstTime: true
    });

  } catch (error) {
    console.error("Error al obtener sugerencia:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
