import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para crear ejercicio
const createExerciseSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  slug: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  commonMistakes: z.string().optional(),
  tips: z.string().optional(),
  primaryMuscle: z.string().min(1, "El músculo principal es requerido"),
  secondaryMuscles: z.array(z.string()).default([]),
  equipment: z.string().min(1, "El equipo es requerido"),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  mechanics: z.enum(["compound", "isolation"]),
  category: z.enum(["push", "pull", "legs", "core", "upper", "lower", "full-body", "stretch", "cardio"]),
  tempo: z.string().optional(),
  breathing: z.string().optional(),
  defaultRepRange: z.object({
    min: z.number().min(1),
    max: z.number().min(1)
  }).optional(),
  defaultRestSec: z.number().min(0).optional(),
  tags: z.array(z.string()).default([])
});

// Esquema para filtros de búsqueda
const searchParamsSchema = z.object({
  query: z.string().optional(),
  muscle: z.string().optional(),
  equipment: z.string().optional(),
  level: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  published: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional()
});

// GET - Listar ejercicios con filtros
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const { searchParams } = new URL(req.url);
    const params = searchParamsSchema.parse(Object.fromEntries(searchParams));

    const page = Number(params.page ?? "1");
    const limit = Number(params.limit ?? "20");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Paginación inválida" }, { status: 400 });
    }
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {};

    if (params.query) {
      where.OR = [
        { name: { contains: params.query, mode: 'insensitive' } },
        { description: { contains: params.query, mode: 'insensitive' } }
      ];
    }

    if (params.muscle) {
      where.OR = [
        { primaryMuscle: { contains: params.muscle, mode: 'insensitive' } },
        { secondaryMuscles: { has: params.muscle } }
      ];
    }

    if (params.equipment) {
      where.equipment = { contains: params.equipment, mode: 'insensitive' };
    }

    if (params.level) {
      where.level = params.level;
    }

    if (params.category) {
      where.category = params.category;
    }

    if (params.tag) {
      where.tags = { has: params.tag };
    }

    if (params.published) {
      where.isPublished = params.published === 'true';
    }

    // Si no hay sesión o no es admin, solo mostrar ejercicios publicados
    if (!session || session.user?.role !== 'admin') {
      where.isPublished = true;
    }

    const [exercises, total] = await Promise.all([
      prisma.exercise.findMany({
        where,
        include: {
          media: {
            where: { isCover: true },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.exercise.count({ where })
    ]);

    return NextResponse.json({
      items: exercises,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error al obtener ejercicios:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo ejercicio (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = createExerciseSchema.parse(body);

    // Generar slug si no se proporciona
    const slug = data.slug || data.name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    // Verificar que el slug sea único
    const existingExercise = await prisma.exercise.findUnique({
      where: { slug }
    });

    if (existingExercise) {
      return NextResponse.json(
        { error: "Ya existe un ejercicio con ese nombre" },
        { status: 400 }
      );
    }

    const exercise = await prisma.exercise.create({
      data: {
        ...data,
        slug,
        defaultRepMin: data.defaultRepRange?.min,
        defaultRepMax: data.defaultRepRange?.max,
        createdBy: session.user.id,
        updatedBy: session.user.id
      }
    });

    return NextResponse.json({ id: exercise.id, slug: exercise.slug });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al crear ejercicio:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
