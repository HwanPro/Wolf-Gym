import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const createSetSchema = z.object({
  weight: z.number().nonnegative(),
  reps: z.number().int().min(1),
  rpe: z.number().min(1).max(10).optional(),
  isWarmup: z.boolean().optional().default(false),
  restSec: z.number().int().min(0).optional(),
  note: z.string().optional()
});

// POST /api/workouts/exercises/[id]/sets
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
    const data = createSetSchema.parse(body);

    const initial = await prisma.workoutExercise.findUnique({where: {id: (await params).id}});
    if (!initial) return NextResponse.json({error: 'Ejercicio no encontrado'}, {status: 404});
    return await prisma.$transaction(async prisma => {
      await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'workout:' + initial.workoutSessionId);
    const wExercise = await prisma.workoutExercise.findUnique({
      where: { id: (await params).id },
      include: {
        workoutSession: true,
        exercise: true,
        sets: true
      }
    });

    if (!wExercise || wExercise.workoutSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Ejercicio de entrenamiento no encontrado" },
        { status: 404 }
      );
    }

    if (wExercise.workoutSession.status === "completed") {
      return NextResponse.json(
        { error: "La sesión ya está completada" },
        { status: 400 }
      );
    }

    const nextIndex = (wExercise.sets[wExercise.sets.length - 1]?.setIndex || 0) + 1;

    const created = await prisma.workoutSet.create({
      data: {
        workoutExerciseId: (await params).id,
        setIndex: nextIndex,
        weight: data.weight,
        reps: data.reps,
        rpe: data.rpe,
        isWarmup: data.isWarmup ?? false,
        restSec: data.restSec,
        note: data.note
      }
    });

    // Recalcular KPIs parciales del workout (volumen, sets, reps)
    const allSets = await prisma.workoutSet.findMany({
      where: { workoutExerciseId: (await params).id, isWarmup: false }
    });

    const partialVolume = allSets.reduce((acc, s) => acc + s.weight * s.reps, 0);
    const partialSets = allSets.length;
    const partialReps = allSets.reduce((acc, s) => acc + s.reps, 0);

    await prisma.workoutSession.update({
      where: { id: wExercise.workoutSessionId },
      data: {
        totalVolume: {
          increment: data.isWarmup ? 0 : data.weight * data.reps
        },
        totalSets: { increment: data.isWarmup ? 0 : 1 },
        totalReps: { increment: data.isWarmup ? 0 : data.reps }
      }
    });

    // Calcular PR (Epley) para respuesta rápida
    const oneRepMax = Math.round((data.weight * (1 + data.reps / 30)) * 10) / 10;

    return NextResponse.json({
      id: created.id,
      setIndex: created.setIndex,
      oneRepMax,
      sessionTotals: {
        partialVolume,
        partialSets,
        partialReps
      }
    });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creando set:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
