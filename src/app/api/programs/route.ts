import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Esquema de validación para crear programa
const createProgramSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  goal: z.enum(["strength", "hypertrophy", "calisthenics", "fat-loss"]),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  weeks: z.number().min(1).max(52),
  tags: z.array(z.string()).default([])
});

// GET - Listar programas
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

    // Si no es admin, solo mostrar programas publicados
    if (session.user?.role !== 'admin') {
      where.isPublished = true;
    }

    // Filtros opcionales
    if (searchParams.get("goal")) {
      where.goal = searchParams.get("goal");
    }
    if (searchParams.get("level")) {
      where.level = searchParams.get("level");
    }
    if (session.user?.role === 'admin' && searchParams.get("published")) {
      where.isPublished = searchParams.get("published") === 'true';
    }

    const [programs, total] = await Promise.all([
      prisma.programTemplate.findMany({
        where,
        include: {
          routines: {
            ...(session.user?.role !== 'admin' ? { where: { isPublished: true } } : {}),
            include: {
              items: {
                include: {
                  exercise: {
                    select: { name: true }
                  }
                }
              }
            }
          },
          _count: {
            select: { userAssignments: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.programTemplate.count({ where })
    ]);

    return NextResponse.json({
      items: programs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error al obtener programas:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo programa (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const data = createProgramSchema.parse(body);

    const program = await prisma.programTemplate.create({
      data
    });

    return NextResponse.json({ id: program.id });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al crear programa:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
