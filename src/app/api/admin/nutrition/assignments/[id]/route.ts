import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/infrastructure/prisma/prisma';
import { requireAdmin } from '@/server/auth/authorization';
import { nutritionDatabaseError } from '@/server/nutrition/database-error';
import { z } from 'zod';
export async function PATCH(req: NextRequest, context: {params: Promise<{id: string}>}) {
 const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
 try {
  const {id} = await context.params; const {status} = z.object({status: z.enum(['ACTIVE','PAUSED','COMPLETED'])}).parse(await req.json());
  const assignment = await prisma.nutritionPlanAssignment.findUnique({where: {id}});
  if (!assignment) return NextResponse.json({error: 'Asignación no encontrada'}, {status: 404});
  return await prisma.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'nutrition-user:' + assignment.userId}))`;
   const current = await tx.nutritionPlanAssignment.findUnique({where: {id}});
   if (!current) return NextResponse.json({error: 'Asignación no encontrada'}, {status: 404});
   if (current.status === 'COMPLETED' && status !== 'COMPLETED') return NextResponse.json({error: 'El plan finalizado conserva su historial; realiza una nueva asignación'}, {status: 409});
   if (status === 'ACTIVE') await tx.nutritionPlanAssignment.updateMany({where: {userId: assignment.userId, status: 'ACTIVE', id: {not: id}}, data: {status: 'PAUSED'}});
   const result = await tx.nutritionPlanAssignment.update({where: {id}, data: {status}, select: {id: true, status: true}});
   return NextResponse.json(result);
  });
 } catch (error) { return error instanceof z.ZodError ? NextResponse.json({error: 'Estado inválido'}, {status: 400}) : nutritionDatabaseError(error) ?? NextResponse.json({error: 'No se pudo actualizar la asignación'}, {status: 500}); }
}
