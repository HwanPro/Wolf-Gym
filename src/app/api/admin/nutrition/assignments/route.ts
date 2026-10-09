import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { nutritionAssignmentInputSchema } from "@/domain/nutrition/nutrition-policy";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { nutritionDatabaseError } from "@/server/nutrition/database-error";

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const assignments = await prisma.nutritionPlanAssignment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        version: {
          select: { version: true, plan: { select: { id: true, name: true, objective: true } } },
        },
      },
    });

    return NextResponse.json({ items: assignments });
  } catch (error) {
    console.error("GET /api/admin/nutrition/assignments failed", error);
    return (
      nutritionDatabaseError(error) ??
      NextResponse.json({ error: "No se pudieron cargar las asignaciones" }, { status: 500 })
    );
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const actorId = authorization.token.id;
  if (typeof actorId !== "string") {
    return NextResponse.json({ error: "Sesión administrativa inválida" }, { status: 401 });
  }

  try {
    const input = nutritionAssignmentInputSchema.parse(await request.json());
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt < startsAt) {
      return NextResponse.json(
        { error: "La fecha final no puede ser anterior al inicio" },
        { status: 400 },
      );
    }

    const [client, plan] = await Promise.all([
      prisma.user.findFirst({
        where: { id: input.userId, role: "client" },
        select: { id: true },
      }),
      prisma.nutritionPlan.findFirst({
        where: { id: input.planId, isArchived: false },
        select: {
          id: true,
          versions: {
            where: { isPublished: true },
            orderBy: { version: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      }),
    ]);

    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    const versionId = plan?.versions[0]?.id;
    if (!versionId) {
      return NextResponse.json({ error: "El plan no tiene una versión publicada" }, { status: 409 });
    }

    const assignment = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'nutrition-user:' + input.userId}))`;
      if (input.assessment) {
        const assessment = input.assessment;
        const profile = await transaction.nutritionProfile.upsert({
          where: { userId: input.userId },
          create: {
            userId: input.userId,
            usesBodyWeight: assessment.usesBodyWeight,
            birthDate: assessment.birthDate ? new Date(assessment.birthDate) : null,
            sexForEquation: assessment.sexForEquation,
            heightCm: assessment.heightCm,
            currentWeightKg: assessment.currentWeightKg,
            activityLevel: assessment.activityLevel,
            objective: assessment.objective,
            allergies: assessment.allergies,
            dietaryRestrictions: assessment.dietaryRestrictions,
            dislikedFoods: assessment.dislikedFoods,
            consentToHealthData: assessment.consentToHealthData,
            consentRecordedAt: assessment.consentToHealthData ? new Date() : null,
            requiresProfessionalReview: assessment.requiresProfessionalReview,
          },
          update: {
            usesBodyWeight: assessment.usesBodyWeight,
            birthDate: assessment.birthDate ? new Date(assessment.birthDate) : null,
            sexForEquation: assessment.sexForEquation,
            heightCm: assessment.heightCm,
            currentWeightKg: assessment.currentWeightKg,
            activityLevel: assessment.activityLevel,
            objective: assessment.objective,
            allergies: assessment.allergies,
            dietaryRestrictions: assessment.dietaryRestrictions,
            dislikedFoods: assessment.dislikedFoods,
            consentToHealthData: assessment.consentToHealthData,
            consentRecordedAt: assessment.consentToHealthData ? new Date() : null,
            requiresProfessionalReview: assessment.requiresProfessionalReview,
          },
          select: { id: true },
        });

        if (assessment.currentWeightKg) {
          await transaction.nutritionMeasurement.create({
            data: {
              profileId: profile.id,
              weightKg: assessment.currentWeightKg,
              source: "assignment",
            },
          });
        }
      }

      await transaction.nutritionPlanAssignment.updateMany({
        where: { userId: input.userId, status: "ACTIVE" },
        data: { status: "PAUSED", updatedAt: new Date() },
      });

      return transaction.nutritionPlanAssignment.create({
        data: {
          userId: input.userId,
          versionId,
          startsAt,
          endsAt,
          notes: input.notes,
          assignedBy: actorId,
        },
        select: { id: true },
      });
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "La asignación contiene datos inválidos", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/nutrition/assignments failed", error);
    return (
      nutritionDatabaseError(error) ??
      NextResponse.json({ error: "No se pudo asignar el plan" }, { status: 500 })
    );
  }
}
