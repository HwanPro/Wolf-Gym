import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/infrastructure/prisma/prisma';
import { requireAdmin } from '@/server/auth/authorization';
import { nutritionPlanInputSchema } from '@/domain/nutrition/nutrition-policy';
import { nutritionVersionData } from '@/server/nutrition/plan-data';
import { nutritionDatabaseError } from '@/server/nutrition/database-error';
import { ZodError } from 'zod';
type Context = {params: Promise<{id: string}>};
export async function GET(req: NextRequest, context: Context) {
 const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
 try {
  const {id} = await context.params;
  const plan = await prisma.nutritionPlan.findUnique({where: {id}, include: {versions: {orderBy: {version: 'desc'}, take: 1, include: {days: {orderBy: {dayIndex: 'asc'}, include: {meals: {orderBy: {sortOrder: 'asc'}, include: {items: {orderBy: {sortOrder: 'asc'}}}}}}}}}});
  return plan && !plan.isArchived ? NextResponse.json(plan) : NextResponse.json({error: 'Plan no encontrado'}, {status: 404});
 } catch (error) { return nutritionDatabaseError(error) ?? NextResponse.json({error: 'No se pudo cargar el plan'}, {status: 500}); }
}
export async function POST(req: NextRequest, context: Context) {
 const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
 try {
  const {id} = await context.params; const input = nutritionPlanInputSchema.parse(await req.json());
  return await prisma.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'nutrition-plan:' + id}))`;
   const plan = await tx.nutritionPlan.findUnique({where: {id}, include: {versions: {orderBy: {version: 'desc'}, take: 1}}});
   if (!plan || plan.isArchived) return NextResponse.json({error: 'Plan no encontrado'}, {status: 404});
   if (input.name !== plan.name || input.objective !== plan.objective || (input.description || '') !== (plan.description || '')) return NextResponse.json({error: 'Conserva el nombre, objetivo y descripción para mantener el historial; crea otro plan si necesitas cambiarlos'}, {status: 409});
   const version = await tx.nutritionPlanVersion.create({data: {...nutritionVersionData(input, (plan.versions[0]?.version ?? 0) + 1), planId: id}});
   await tx.nutritionPlan.update({where: {id}, data: {updatedAt: new Date()}});
   return NextResponse.json({id, name: plan.name, version: version.version, versionId: version.id}, {status: 201});
  });
 } catch (error) { return error instanceof ZodError ? NextResponse.json({error: 'El plan contiene datos inválidos'}, {status: 400}) : nutritionDatabaseError(error) ?? NextResponse.json({error: 'No se pudo guardar la versión'}, {status: 500}); }
}
