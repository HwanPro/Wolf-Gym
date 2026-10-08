import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET - Obtener entrenamientos recientes y KPIs
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") ?? "3");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: "Límite inválido" }, { status: 400 });

    // Obtener entrenamientos recientes completados
    const recentWorkouts = await prisma.workoutSession.findMany({
      where: {
        userId: session.user.id,
        status: 'completed'
      },
      include: {
        routineTemplate: {
          select: { name: true }
        },
        exercises: {
          include: {
            exercise: {
              select: { name: true, primaryMuscle: true }
            },
            sets: {
              where: { isWarmup: false }
            }
          }
        }
      },
      orderBy: { date: 'desc' },
      take: limit
    });

    // Calcular KPIs de la semana actual
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sábado
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklyStats = await prisma.workoutSession.aggregate({
      where: {
        userId: session.user.id,
        status: 'completed',
        date: {
          gte: startOfWeek,
          lte: endOfWeek
        }
      },
      _sum: {
        totalVolume: true,
        totalSets: true,
        totalReps: true
      },
      _count: {
        id: true
      }
    });

    // Calcular KPIs del mes actual
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyStats = await prisma.workoutSession.aggregate({
      where: {
        userId: session.user.id,
        status: 'completed',
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      _sum: {
        totalVolume: true,
        totalSets: true,
        totalReps: true
      },
      _count: {
        id: true
      }
    });

    // Obtener PRs recientes (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const recentPRs = await prisma.workoutSet.findMany({
      where: {
        workoutExercise: {
          workoutSession: {
            userId: session.user.id,
            status: 'completed',
            date: {
              gte: thirtyDaysAgo
            }
          }
        },
        isWarmup: false
      },
      include: {
        workoutExercise: {
          include: {
            exercise: {
              select: { name: true }
            },
            workoutSession: {
              select: { date: true }
            }
          }
        }
      },
      orderBy: {
        weight: 'desc'
      }
    });

    // Procesar PRs por ejercicio
    const prsByExercise = new Map();
    recentPRs.forEach(set => {
      const exerciseName = set.workoutExercise.exercise.name;
      const oneRepMax = set.weight * (1 + set.reps / 30); // Fórmula de Epley

      if (!prsByExercise.has(exerciseName) || oneRepMax > prsByExercise.get(exerciseName).oneRepMax) {
        prsByExercise.set(exerciseName, {
          exerciseName,
          weight: set.weight,
          reps: set.reps,
          oneRepMax: Math.round(oneRepMax * 10) / 10,
          date: set.workoutExercise.workoutSession.date
        });
      }
    });

    // Formatear entrenamientos recientes con resumen
    const formattedWorkouts = recentWorkouts.map(workout => ({
      id: workout.id,
      date: workout.date,
      routineName: workout.routineTemplate?.name || 'Entrenamiento libre',
      duration: workout.endTime && workout.startTime ?
        Math.round((workout.endTime.getTime() - workout.startTime.getTime()) / 1000 / 60) : 0,
      totalVolume: workout.totalVolume,
      totalSets: workout.totalSets,
      totalReps: workout.totalReps,
      exerciseCount: workout.exercises.length,
      primaryMuscles: [...new Set(workout.exercises.map(ex => ex.exercise.primaryMuscle))]
    }));

    return NextResponse.json({
      recentWorkouts: formattedWorkouts,
      weeklyKPIs: {
        workouts: weeklyStats._count.id || 0,
        totalVolume: Math.round((weeklyStats._sum.totalVolume || 0) * 10) / 10,
        totalSets: weeklyStats._sum.totalSets || 0,
        totalReps: weeklyStats._sum.totalReps || 0,
        avgVolumePerWorkout: weeklyStats._count.id ?
          Math.round(((weeklyStats._sum.totalVolume || 0) / weeklyStats._count.id) * 10) / 10 : 0
      },
      monthlyKPIs: {
        workouts: monthlyStats._count.id || 0,
        totalVolume: Math.round((monthlyStats._sum.totalVolume || 0) * 10) / 10,
        totalSets: monthlyStats._sum.totalSets || 0,
        totalReps: monthlyStats._sum.totalReps || 0,
        avgVolumePerWorkout: monthlyStats._count.id ?
          Math.round(((monthlyStats._sum.totalVolume || 0) / monthlyStats._count.id) * 10) / 10 : 0
      },
      recentPRs: Array.from(prsByExercise.values()).slice(0, 5) // Top 5 PRs
    });

  } catch (error) {
    console.error("Error al obtener entrenamientos recientes:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
