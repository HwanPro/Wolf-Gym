import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para crear rutina
import { routineSchema as createRoutineSchema } from "@/server/validation/routine";

// GET - Listar rutinas
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = {};

    // Si no es admin, solo mostrar rutinas publicadas
    if (session.user?.role !== 'admin') {
      where.isPublished = true;
    }

    if (searchParams.get("query")) where.name = {contains: searchParams.get("query"), mode: "insensitive"};
    // Filtros opcionales
    if (searchParams.get("programId")) {
      where.programId = searchParams.get("programId");
    }
    if (searchParams.get("goal")) {
      where.goal = searchParams.get("goal");
    }
    if (searchParams.get("level")) {
      where.level = searchParams.get("level");
    }

    const [routines, total] = await Promise.all([
      prisma.routineTemplate.findMany({
        where,
        include: {
          program: {
            select: { name: true }
          },
          items: {
            include: {
              exercise: {
                select: {
                  name: true,
                  primaryMuscle: true,
                  media: {
                    where: { isCover: true },
                    take: 1
                  }
                }
              }
            },
            orderBy: { order: 'asc' }
          },
          _count: {
            select: { userAssignments: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.routineTemplate.count({ where })
    ]);

    return NextResponse.json({
      items: routines,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error al obtener rutinas:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Crear nueva rutina (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = createRoutineSchema.parse(body);

    // Si se especifica programId, verificar que existe
    if (data.programId) {
      const program = await prisma.programTemplate.findUnique({
        where: { id: data.programId }
      });

      if (!program) {
        return NextResponse.json(
          { error: "Programa no encontrado" },
          { status: 404 }
        );
      }
    }

    const {items, ...fields} = data;
    if (items && await prisma.exercise.count({where: {id: {in: [...new Set(items.map(i => i.exerciseId))]}, isPublished: true}}) !== new Set(items.map(i => i.exerciseId)).size) return NextResponse.json({error: 'Ejercicio no publicado'}, {status: 400});
    const routine = await prisma.routineTemplate.create({data: {...fields, ...(items ? {items: {create: items}} : {})}});

    return NextResponse.json({ id: routine.id });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al crear rutina:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
