import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para actualizar ejercicio
const updateExerciseSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  commonMistakes: z.string().optional(),
  tips: z.string().optional(),
  primaryMuscle: z.string().min(1).optional(),
  secondaryMuscles: z.array(z.string()).optional(),
  equipment: z.string().min(1).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  mechanics: z.enum(["compound", "isolation"]).optional(),
  category: z.enum(["push", "pull", "legs", "core", "upper", "lower", "full-body", "stretch", "cardio"]).optional(),
  tempo: z.string().optional(),
  breathing: z.string().optional(),
  defaultRepRange: z.object({
    min: z.number().min(1),
    max: z.number().min(1)
  }).optional(),
  defaultRestSec: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  isVerified: z.boolean().optional()
});

// GET - Obtener ejercicio por ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: (await params).id },
      include: {
        media: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!exercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Si no es admin, solo mostrar ejercicios publicados
    if (session.user?.role !== 'admin' && !exercise.isPublished) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Formatear la respuesta
    const formattedExercise = {
      ...exercise,
      defaultRepRange: exercise.defaultRepMin && exercise.defaultRepMax ? {
        min: exercise.defaultRepMin,
        max: exercise.defaultRepMax
      } : null
    };

    return NextResponse.json(formattedExercise);

  } catch (error) {
    console.error("Error al obtener ejercicio:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT - Actualizar ejercicio (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = updateExerciseSchema.parse(body);

    // Verificar que el ejercicio existe
    const existingExercise = await prisma.exercise.findUnique({
      where: { id: (await params).id }
    });

    if (!existingExercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Si se actualiza el slug, verificar que sea único
    if (data.slug && data.slug !== existingExercise.slug) {
      const slugExists = await prisma.exercise.findUnique({
        where: { slug: data.slug }
      });

      if (slugExists) {
        return NextResponse.json(
          { error: "Ya existe un ejercicio con ese slug" },
          { status: 400 }
        );
      }
    }

    // Actualizar ejercicio
    const updateData: any = {
      ...data,
      updatedBy: session.user.id
    };

    // Manejar defaultRepRange
    if (data.defaultRepRange) {
      updateData.defaultRepMin = data.defaultRepRange.min;
      updateData.defaultRepMax = data.defaultRepRange.max;
      delete updateData.defaultRepRange;
    }

    await prisma.exercise.update({
      where: { id: (await params).id },
      data: updateData
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al actualizar ejercicio:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar ejercicio (solo admin)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Verificar que el ejercicio existe
    const existingExercise = await prisma.exercise.findUnique({
      where: { id: (await params).id }
    });

    if (!existingExercise) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado" },
        { status: 404 }
      );
    }

    // Verificar si el ejercicio está siendo usado en rutinas
    const routineItemsCount = await prisma.routineItem.count({
      where: { exerciseId: (await params).id }
    });

    if (routineItemsCount > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar el ejercicio porque está siendo usado en rutinas" },
        { status: 400 }
      );
    }

    // Eliminar ejercicio (las relaciones se eliminan en cascada)
    await prisma.exercise.delete({
      where: { id: (await params).id }
    });

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("Error al eliminar ejercicio:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
