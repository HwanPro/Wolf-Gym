import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/infrastructure/prisma/prisma";
import { z } from "zod";
const setSchema = z.object({ setIndex: z.number().int().min(1).max(100), weight: z.number().finite().min(0).max(2000), reps: z.number().int().min(1).max(1000), rpe: z.number().min(1).max(10).optional(), isWarmup: z.boolean().default(false), restSec: z.number().int().min(0).optional(), note: z.string().max(2000).optional() });
type Context = { params: Promise<{ id: string; wid: string }> };
async function mutate(req: NextRequest, context: Context, replace: boolean) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id, wid } = await context.params;
    const body = await req.json();
    const sets = replace ? z.object({ sets: z.array(setSchema).max(100) }).parse(body).sets : [setSchema.parse(body)];
    if (new Set(sets.map(s => s.setIndex)).size !== sets.length) return NextResponse.json({error: "Índices de serie repetidos"}, {status: 400});
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'workout:' + id}))`;
      const exercise = await tx.workoutExercise.findUnique({where: {id: wid}, include: {workoutSession: true}});
      if (!exercise || exercise.workoutSessionId !== id || exercise.workoutSession.userId !== session.user.id) return NextResponse.json({error: "Ejercicio de entrenamiento no encontrado"}, {status: 404});
      if (exercise.workoutSession.status !== 'in-progress') return NextResponse.json({error: "No se puede modificar un entrenamiento completado"}, {status: 400});
      const saved = [];
      for (const data of sets) {
        const previous = await tx.workoutSet.findMany({where: {workoutExerciseId: wid, setIndex: data.setIndex}, orderBy: {completedAt: 'asc'}});
        const value = previous[0] ? await tx.workoutSet.update({where: {id: previous[0].id}, data}) : await tx.workoutSet.create({data: {...data, workoutExerciseId: wid}});
        if (previous.length > 1) await tx.workoutSet.deleteMany({where: {id: {in: previous.slice(1).map(s => s.id)}}});
        saved.push(value);
      }
      if (replace) await tx.workoutSet.deleteMany({where: {workoutExerciseId: wid, setIndex: {notIn: sets.map(s => s.setIndex)}}});
      return NextResponse.json(replace ? saved : {id: saved[0].id});
    });
  } catch (error) {
    return NextResponse.json({error: error instanceof z.ZodError || error instanceof SyntaxError ? "Datos inválidos" : "No se pudieron guardar las series"}, {status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500});
  }
}
export const POST = (req: NextRequest, context: Context) => mutate(req, context, false);
export const PUT = (req: NextRequest, context: Context) => mutate(req, context, true);
export async function DELETE(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({error: "No autorizado"}, {status: 401});
  const {id, wid} = await context.params;
  const rawIndex = req.nextUrl.searchParams.get('setIndex');
  const parsed = z.coerce.number().int().min(1).max(100).safeParse(rawIndex);
  if (!rawIndex || !parsed.success) return NextResponse.json({error: 'Indica la serie que quieres eliminar'}, {status: 400});
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'workout:' + id}))`;
    const exercise = await tx.workoutExercise.findUnique({where: {id: wid}, include: {workoutSession: true}});
    if (!exercise || exercise.workoutSessionId !== id || exercise.workoutSession.userId !== session.user.id) return NextResponse.json({error: 'Ejercicio no encontrado'}, {status: 404});
    if (exercise.workoutSession.status !== 'in-progress') return NextResponse.json({error: 'La sesión ya está completada'}, {status: 400});
    const result = await tx.workoutSet.deleteMany({where: {workoutExerciseId: wid, setIndex: parsed.data}});
    return result.count ? NextResponse.json({success: true}) : NextResponse.json({error: 'Serie no encontrada'}, {status: 404});
  });
}
export async function GET(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({error: "No autorizado"}, {status: 401});
  const {id, wid} = await context.params;
  const exercise = await prisma.workoutExercise.findUnique({where: {id: wid}, include: {workoutSession: true}});
  if (!exercise || exercise.workoutSessionId !== id || exercise.workoutSession.userId !== session.user.id) return NextResponse.json({error: "Ejercicio de entrenamiento no encontrado"}, {status: 404});
  return NextResponse.json(await prisma.workoutSet.findMany({where: {workoutExerciseId: wid}, orderBy: {setIndex: 'asc'}}));
}
