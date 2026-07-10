import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/server/auth/authorization";

const storySchema = z.object({
  title: z.string().min(1, { message: "El título es obligatorio" }),
  content: z.string().min(1, { message: "El contenido es obligatorio" }),
  imageUrl: z.string().url().optional(),
  link: z.string().url().optional(),
});

// GET
export async function GET() {
  try {
    const stories = await prisma.story.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(stories, { status: 200 });
  } catch (error) {
    console.error("Error GET /api/stories:", error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST
export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await request.json();
    const validatedData = storySchema.parse(body);
    const newStory = await prisma.story.create({
      data: {
        title: validatedData.title,
        content: validatedData.content,
        imageUrl: validatedData.imageUrl ?? "",
        link: validatedData.link ?? null,
      },
    });
    return NextResponse.json(newStory, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error POST /api/stories:", error);
    return NextResponse.json(
      { error: "Error al crear historia" },
      { status: 500 }
    );
  }
}

// PUT
export async function PUT(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }
    const validatedData = storySchema.partial().parse(data);
    const updatedStory = await prisma.story.update({
      where: { id },
      data: validatedData,
    });
    return NextResponse.json(updatedStory, { status: 200 });
  } catch (error) {
    console.error("Error PUT /api/stories:", error);
    return NextResponse.json(
      { error: "Error al actualizar historia" },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }
    await prisma.story.delete({ where: { id } });
    return NextResponse.json(
      { message: "Historia eliminada" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error DELETE /api/stories:", error);
    return NextResponse.json(
      { error: "Error al eliminar historia" },
      { status: 500 }
    );
  }
}
