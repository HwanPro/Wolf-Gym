import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const updateWorkoutSchema = z.object({
  notes: z.string().optional(),
  name: z.string().optional() // opcional si luego agregamos columna dedicada
});

// PATCH /api/workouts/[id] - actualizar nombre/notas de la sesión
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const data = updateWorkoutSchema.parse(body);

    const workout = await prisma.workoutSession.findUnique({ where: { id: (await params).id } });
    if (!workout || workout.userId !== session.user.id) {
      return NextResponse.json({ error: "Entrenamiento no encontrado" }, { status: 404 });
    }

    // Por ahora guardamos el nombre en notes si 'name' viene definido
    const notes = data.name ? `${data.name}${data.notes ? ` — ${data.notes}` : ""}` : data.notes;

    const updated = await prisma.workoutSession.update({
      where: { id: (await params).id },
      data: {
        notes
      },
      select: { id: true, notes: true }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error actualizando entrenamiento:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
