// src/app/api/admin/dashboard/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/infrastructure/prisma/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    // Ingresos totales (suma de todas las compras)
    const totalIncomeResult = await prisma.paymentRecord.aggregate({ where: { payment_status: "COMPLETED" },
      _sum: {
        payment_amount: true,
      },
    });

    const totalIncome = Number(totalIncomeResult._sum.payment_amount || 0);

    // Nuevos clientes (usuarios creados en los últimos 30 días)
    const newClients = await prisma.user.count({
      where: {
        role: 'client',
        createdAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
      },
    });

    // Ventas de productos (compras realizadas en los últimos 30 días)
    const productSales = await prisma.purchase.count({
      where: {
        OR: [{ cashSaleId: null }, { cashSale: { is: { status: { not: "VOIDED" } } } }], purchase_date: { // Asegúrate de que 'purchase_date' existe en tu modelo 'Purchase'
          gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
      },
    });

    // Asistencia a clases (si tienes este modelo, ajusta según corresponda)
    const classAttendance = 0; // Placeholder, ajusta según tu modelo

    const data = {
      totalIncome,
      newClients,
      productSales,
      classAttendance,
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error al obtener los datos del dashboard:', error);
    return NextResponse.json(
      { message: 'Error al obtener los datos del dashboard' },
      { status: 500 }
    );
  }
}
