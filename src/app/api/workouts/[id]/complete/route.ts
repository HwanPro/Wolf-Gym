import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Función para calcular 1RM usando la fórmula de Epley
function calculateOneRepMax(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Función para generar sugerencias de progresión
async function generateProgressSuggestions(prisma: Prisma.TransactionClient, userId: string, exerciseId: string) {
  // Obtener las últimas 3 sesiones de este ejercicio
  const recentSets = await prisma.workoutSet.findMany({
    where: {
      workoutExercise: {
        exerciseId,
        workoutSession: {
          userId,
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
    },
    take: 10 // Últimas 10 series para análisis
  });

  if (recentSets.length === 0) return null;

  // Analizar rendimiento
  const avgWeight = recentSets.reduce((sum, set) => sum + set.weight, 0) / recentSets.length;
  const avgReps = recentSets.reduce((sum, set) => sum + set.reps, 0) / recentSets.length;
  const avgRpe = recentSets.filter(set => set.rpe).reduce((sum, set) => sum + (set.rpe || 0), 0) / recentSets.filter(set => set.rpe).length;

  let suggestedWeight = avgWeight;
  let rationale = "Mantener peso actual";

  // Lógica de progresión basada en RPE y reps
  if (avgRpe && avgRpe < 7 && avgReps >= 10) {
    // RPE bajo y muchas reps -> aumentar peso
    suggestedWeight = avgWeight * 1.025; // +2.5%
    rationale = "Aumentar peso por buen rendimiento (RPE bajo, reps altas)";
  } else if (avgRpe && avgRpe > 9) {
    // RPE muy alto -> reducir peso
    suggestedWeight = avgWeight * 0.975; // -2.5%
    rationale = "Reducir peso por alta fatiga (RPE alto)";
  } else if (avgReps >= 12) {
    // Muchas reps sin RPE -> aumentar peso
    suggestedWeight = avgWeight * 1.025;
    rationale = "Aumentar peso por alto número de repeticiones";
  }

  return {
    suggestedWeight: Math.round(suggestedWeight * 4) / 4, // Redondear a 0.25kg
    rationale
  };
}

// PUT - Completar entrenamiento
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const id = (await params).id;
    return await prisma.$transaction(async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'workout:' + id}))`;
    // Verificar que el entrenamiento existe y pertenece al usuario
    const workout = await prisma.workoutSession.findUnique({
      where: { id: (await params).id },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: {
              where: { isWarmup: false }
            }
          }
        }
      }
    });

    if (!workout || workout.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Entrenamiento no encontrado" },
        { status: 404 }
      );
    }

    if (workout.status === 'completed') {
      return NextResponse.json(
        { error: "El entrenamiento ya está completado" },
        { status: 400 }
      );
    }

    // Calcular estadísticas del entrenamiento
    let totalVolume = 0;
    let totalSets = 0;
    let totalReps = 0;
    const prs: any[] = [];

    for (const exercise of workout.exercises) {
      const workingSets = exercise.sets.filter(set => !set.isWarmup);

      for (const set of workingSets) {
        totalVolume += set.weight * set.reps;
        totalSets += 1;
        totalReps += set.reps;

        // Verificar si es un PR (Personal Record)
        const previousBest = await prisma.workoutSet.findFirst({
          where: {
            workoutExercise: {
              exerciseId: exercise.exerciseId,
              workoutSession: {
                userId: session.user.id,
                status: 'completed',
                id: { not: (await params).id }
              }
            },
            isWarmup: false
          },
          orderBy: {
            weight: 'desc'
          }
        });

        const currentOneRepMax = calculateOneRepMax(set.weight, set.reps);
        const previousOneRepMax = previousBest ? calculateOneRepMax(previousBest.weight, previousBest.reps) : 0;

        if (currentOneRepMax > previousOneRepMax) {
          prs.push({
            exerciseName: exercise.exercise.name,
            weight: set.weight,
            reps: set.reps,
            estimatedOneRepMax: Math.round(currentOneRepMax * 10) / 10,
            previousBest: Math.round(previousOneRepMax * 10) / 10
          });
        }
      }

      // Generar sugerencias de progresión para el próximo entrenamiento
      const suggestion = await generateProgressSuggestions(prisma, session.user.id, exercise.exerciseId);

      if (suggestion) {
        await prisma.exerciseProgressSuggestion.upsert({
          where: {
            userId_exerciseId: {
              userId: session.user.id,
              exerciseId: exercise.exerciseId
            }
          },
          update: {
            suggestedWeight: suggestion.suggestedWeight,
            rationale: suggestion.rationale,
            updatedAt: new Date()
          },
          create: {
            userId: session.user.id,
            exerciseId: exercise.exerciseId,
            suggestedWeight: suggestion.suggestedWeight,
            rationale: suggestion.rationale
          }
        });
      }
    }

    // Actualizar el entrenamiento
    const updatedWorkout = await prisma.workoutSession.update({
      where: { id: (await params).id },
      data: {
        status: 'completed',
        endTime: new Date(),
        totalVolume,
        totalSets,
        totalReps
      }
    });

    return NextResponse.json({
      totalVolume,
      totalSets,
      totalReps,
      duration: updatedWorkout.endTime && updatedWorkout.startTime ?
        Math.round((updatedWorkout.endTime.getTime() - updatedWorkout.startTime.getTime()) / 1000 / 60) : 0,
      prs
    });

    });
  } catch (error) {
    console.error("Error al completar entrenamiento:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
