// src/app/api/debts/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { getToken } from "next-auth/jwt";
import { z } from "zod";

// Mapeo de productos y precios
const PRODUCT_PRICES = {
  WATER_1_5: 1.5,
  WATER_2_5: 2.5,
  WATER_3_5: 3.5,
  PROTEIN_5: 5.0,
  PRE_WORKOUT_3: 3.0,
  PRE_WORKOUT_5: 5.0,
  PRE_WORKOUT_10: 10.0,
  CUSTOM: 0, // Se define manualmente
} as const;

const PRODUCT_NAMES = {
  WATER_1_5: "Agua S/. 1.50",
  WATER_2_5: "Agua S/. 2.50",
  WATER_3_5: "Agua S/. 3.50",
  PROTEIN_5: "Proteína (scoop)",
  PRE_WORKOUT_3: "Pre entreno S/. 3.00",
  PRE_WORKOUT_5: "Pre entreno S/. 5.00",
  PRE_WORKOUT_10: "Pre entreno S/. 10.00",
  CUSTOM: "Producto personalizado",
} as const;

const addDebtSchema = z.object({
  clientProfileId: z.string(),
  productType: z.enum([
    "WATER_1_5",
    "WATER_2_5", 
    "WATER_3_5",
    "PROTEIN_5",
    "PRE_WORKOUT_3",
    "PRE_WORKOUT_5",
    "PRE_WORKOUT_10",
    "CUSTOM"
  ]),
  quantity: z.number().min(1).default(1),
  customAmount: z.number().optional(),
  customName: z.string().optional(),
});

// GET - Obtener deudas de un cliente
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientProfileId = searchParams.get("clientProfileId");

  if (!clientProfileId) {
    return NextResponse.json({ error: "clientProfileId requerido" }, { status: 400 });
  }

  try {
    // Obtener deudas diarias
    const dailyDebts = await prisma.dailyDebt.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: "desc" },
    });

    // Obtener deuda mensual del perfil
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { profile_id: clientProfileId },
      select: { debt: true },
    });

    // Calcular total de deuda diaria
    const dailyTotal = dailyDebts.reduce((sum, debt) => sum + Number(debt.amount), 0);

    return NextResponse.json({
      dailyDebts: dailyDebts.map(debt => ({
        ...debt,
        amount: Number(debt.amount),
        productName: debt.productName || PRODUCT_NAMES[debt.productType as keyof typeof PRODUCT_NAMES],
      })),
      dailyTotal,
      monthlyDebt: Number(clientProfile?.debt || 0),
      totalDebt: dailyTotal + Number(clientProfile?.debt || 0),
    });
  } catch (error) {
    console.error("Error al obtener deudas:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Agregar nueva deuda
export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = addDebtSchema.parse(body);

    let amount: number;
    let productName: string | undefined;

    if (validatedData.productType === "CUSTOM") {
      if (!validatedData.customAmount || !validatedData.customName) {
        return NextResponse.json(
          { error: "Para productos personalizados se requiere monto y nombre" },
          { status: 400 }
        );
      }
      amount = validatedData.customAmount * validatedData.quantity;
      productName = validatedData.customName;
    } else {
      const unitPrice = PRODUCT_PRICES[validatedData.productType as keyof typeof PRODUCT_PRICES];
      amount = unitPrice * validatedData.quantity;
      productName = PRODUCT_NAMES[validatedData.productType as keyof typeof PRODUCT_NAMES];
    }

    // Crear la deuda diaria
    const dailyDebt = await prisma.dailyDebt.create({
      data: {
        clientProfileId: validatedData.clientProfileId,
        productType: validatedData.productType,
        productName,
        amount,
        quantity: validatedData.quantity,
        createdBy: token.sub,
      },
    });

    const [dailyAggregate, clientProfile] = await Promise.all([
      prisma.dailyDebt.aggregate({
        where: { clientProfileId: validatedData.clientProfileId },
        _sum: { amount: true },
      }),
      prisma.clientProfile.findUnique({
        where: { profile_id: validatedData.clientProfileId },
        select: { debt: true },
      }),
    ]);
    const dailyTotal = Number(dailyAggregate._sum.amount || 0);
    const monthlyDebt = Number(clientProfile?.debt || 0);

    return NextResponse.json({
      message: "Deuda agregada exitosamente",
      debt: {
        ...dailyDebt,
        amount: Number(dailyDebt.amount),
      },
      summary: {
        dailyDebt: dailyTotal,
        monthlyDebt,
        totalDebt: dailyTotal + monthlyDebt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error al agregar deuda:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar deuda específica
export async function DELETE(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const debtId = searchParams.get("debtId");

  if (!debtId) {
    return NextResponse.json({ error: "debtId requerido" }, { status: 400 });
  }

  try {
    // Obtener la deuda antes de eliminarla para el historial
    const debt = await prisma.dailyDebt.findUnique({
      where: { id: debtId },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    // Mover al historial
    await prisma.debtHistory.create({
      data: {
        clientProfileId: debt.clientProfileId,
        productType: debt.productType,
        productName: debt.productName,
        amount: debt.amount,
        quantity: debt.quantity,
        debtType: "daily",
        createdAt: debt.createdAt,
        deletedAt: new Date(),
        createdBy: debt.createdBy,
      },
    });

    // Eliminar la deuda diaria
    await prisma.dailyDebt.delete({
      where: { id: debtId },
    });

    return NextResponse.json({ message: "Deuda eliminada exitosamente" });
  } catch (error) {
    console.error("Error al eliminar deuda:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
