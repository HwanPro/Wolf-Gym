import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getMembershipStatus } from "@/domain/attendance/attendance-policy";

const prisma = new PrismaClient();

// Esquema de validación para crear sesión de entrenamiento
const createWorkoutSchema = z.object({
  date: z.string().datetime().optional(),
  routineTemplateId: z.string().optional(),
  notes: z.string().optional()
});

// GET - Obtener entrenamientos del usuario
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status"); // in-progress, completed
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {
      userId: session.user.id
    };

    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const workouts = await prisma.workoutSession.findMany({
      where,
      include: {
        routineTemplate: {
          select: { name: true }
        },
        exercises: {
          include: {
            exercise: {
              select: { name: true, primaryMuscle: true }
            },
            sets: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { date: 'desc' },
      take: limit
    });

    return NextResponse.json(workouts);

  } catch (error) {
    console.error("Error al obtener entrenamientos:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Crear nueva sesión de entrenamiento
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const data = createWorkoutSchema.parse(body);

    // Verificar que el usuario tiene suscripción activa
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        memberships: {
          include: { membership: true }
        },
        profile: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Verificar suscripción activa (reutilizando lógica del dashboard)
    let hasActiveSubscription = false;

    if (user.profile?.profile_end_date) {
      hasActiveSubscription = !getMembershipStatus(user.profile.profile_end_date).expired;
    } else if (user.memberships && user.memberships.length > 0) {
      const membership = user.memberships[0];
      const startDate = new Date(membership.assignedAt);
      const endDate = new Date(
        startDate.getTime() + membership.membership.membership_duration * 86400000
      );
      hasActiveSubscription = !getMembershipStatus(endDate).expired;
    }

    if (!hasActiveSubscription) {
      return NextResponse.json(
        { error: "Necesitas una suscripción activa para crear entrenamientos" },
        { status: 403 }
      );
    }

    // Si se especifica rutina, verificar que existe y está asignada al usuario
    if (data.routineTemplateId) {
      const routine = await prisma.routineTemplate.findUnique({
        where: { id: data.routineTemplateId }
      });

      if (!routine || !routine.isPublished) {
        return NextResponse.json(
          { error: "Rutina no encontrada" },
          { status: 404 }
        );
      }

      // Verificar asignación (opcional, se puede permitir usar cualquier rutina publicada)
    }

    const workout = await prisma.workoutSession.create({
      data: {
        userId: session.user.id,
        date: data.date ? new Date(data.date) : new Date(),
        routineTemplateId: data.routineTemplateId,
        notes: data.notes,
        status: "in-progress"
      }
    });

    return NextResponse.json({
      id: workout.id,
      status: workout.status
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al crear entrenamiento:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
