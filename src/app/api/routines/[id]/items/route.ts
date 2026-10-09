import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

export async function DELETE(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') return NextResponse.json({error: 'No autorizado'}, {status: 403});
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({error: 'Indica el ejercicio que quieres retirar'}, {status: 400});
  const {id} = await params;
  const removed = await prisma.routineItem.deleteMany({where: {id: itemId, routineId: id}});
  return removed.count ? NextResponse.json({success: true}) : NextResponse.json({error: 'Ejercicio no encontrado'}, {status: 404});
}

// Esquema de validación para agregar ejercicio a rutina
const addRoutineItemSchema = z.object({
  exerciseId: z.string().min(1, "El ID del ejercicio es requerido"),
  order: z.number().min(1).optional(),
  targetRepsMin: z.number().min(1).optional(),
  targetRepsMax: z.number().min(1).optional(),
  targetSets: z.number().min(1).optional(),
  targetRPE: z.number().min(1).max(10).optional(),
  targetRestSec: z.number().min(0).optional(),
  notes: z.string().optional(),
  isOptional: z.boolean().default(false)
});

// POST - Agregar ejercicio a rutina
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = addRoutineItemSchema.parse(body);

    // Verificar que la rutina existe
    const routine = await prisma.routineTemplate.findUnique({
      where: { id: (await params).id }
    });

    if (!routine) {
      return NextResponse.json(
        { error: "Rutina no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que el ejercicio existe y está publicado
    const exercise = await prisma.exercise.findUnique({
      where: { id: data.exerciseId }
    });

    if (!exercise || !exercise.isPublished) {
      return NextResponse.json(
        { error: "Ejercicio no encontrado o no publicado" },
        { status: 404 }
      );
    }

    // Si no se especifica order, usar el siguiente disponible
    let order = data.order;
    if (!order) {
      const lastItem = await prisma.routineItem.findFirst({
        where: { routineId: (await params).id },
        orderBy: { order: 'desc' }
      });
      order = (lastItem?.order || 0) + 1;
    }

    const routineItem = await prisma.routineItem.create({
      data: {
        ...data,
        routineId: (await params).id,
        order
      }
    });

    return NextResponse.json({ id: routineItem.id });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al agregar ejercicio a rutina:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET - Obtener ejercicios de una rutina
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que la rutina existe
    const routine = await prisma.routineTemplate.findUnique({
      where: { id: (await params).id }
    });

    if (!routine) {
      return NextResponse.json(
        { error: "Rutina no encontrada" },
        { status: 404 }
      );
    }

    // Si no es admin, solo mostrar rutinas publicadas
    if (session.user?.role !== 'admin' && !routine.isPublished) {
      return NextResponse.json(
        { error: "Rutina no encontrada" },
        { status: 404 }
      );
    }

    const items = await prisma.routineItem.findMany({
      where: { routineId: (await params).id },
      include: {
        exercise: {
          include: {
            media: {
              where: { isCover: true },
              take: 1
            }
          }
        }
      },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json(items);

  } catch (error) {
    console.error("Error al obtener ejercicios de rutina:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
