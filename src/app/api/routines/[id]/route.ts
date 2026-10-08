import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { routineSchema } from "@/server/validation/routine";
import { ZodError } from "zod";
type Context = {params: Promise<{id: string}>};
export async function PUT(req: NextRequest, ctx: Context) {
 const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
 try {
  const {id} = await ctx.params; const {items, ...data} = routineSchema.parse(await req.json());
  return await prisma.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'routine:' + id}))`;
   if (!await tx.routineTemplate.findUnique({where: {id}})) return NextResponse.json({error: "Rutina no encontrada"}, {status: 404});
   if (items) {
    const count = await tx.exercise.count({where: {id: {in: [...new Set(items.map(i => i.exerciseId))]}, isPublished: true}});
    if (count !== new Set(items.map(i => i.exerciseId)).size) return NextResponse.json({error: "Ejercicio no publicado"}, {status: 400});
    await tx.routineItem.deleteMany({where: {routineId: id}});
   }
   const result = await tx.routineTemplate.update({where: {id}, data: {...data, ...(items ? {items: {create: items}} : {})}});
   return NextResponse.json({id: result.id});
  });
 } catch (error) { return NextResponse.json({error: error instanceof ZodError ? 'Datos inválidos' : 'No se pudo actualizar la rutina'}, {status: error instanceof ZodError ? 400 : 500}); }
}
export async function DELETE(req: NextRequest, ctx: Context) {
 const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
 const {id} = await ctx.params;
 return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'routine:' + id}))`;
  const routine = await tx.routineTemplate.findUnique({where: {id}, include: {_count: {select: {userAssignments: true, workoutSessions: true}}}});
  if (!routine) return NextResponse.json({error: 'Rutina no encontrada'}, {status: 404});
  if (routine._count.userAssignments || routine._count.workoutSessions) return NextResponse.json({error: 'La rutina tiene historial o asignaciones; despublícala para conservarlos'}, {status: 409});
  await tx.routineTemplate.delete({where: {id}}); return NextResponse.json({success: true});
 });
}
