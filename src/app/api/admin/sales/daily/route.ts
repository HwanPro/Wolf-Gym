import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { getLimaDayRange } from "@/domain/attendance/attendance-policy";
import { buildSaleQuote } from "@/domain/sales/sale-policy";
import prisma from "@/infrastructure/prisma/prisma";

type DispatchItemInput = {
  productId: string;
  quantity: number;
};

function startAndEndOfToday() {
  const { start, end } = getLimaDayRange();
  return { startOfDay: start, endOfDay: end };
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { startOfDay, endOfDay } = startAndEndOfToday();

    const [summary, sales] = await Promise.all([
      prisma.purchase.aggregate({
        where: {
          purchase_date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        _count: { id: true },
        _sum: {
          purchase_total: true,
          purchase_quantity: true,
        },
      }),
      prisma.purchase.findMany({
        where: {
          purchase_date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { purchase_date: "desc" },
        include: {
          product: {
            select: {
              item_name: true,
            },
          },
          customer: {
            select: {
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      date: startOfDay.toISOString().slice(0, 10),
      totals: {
        salesCount: summary._count.id,
        itemsCount: summary._sum.purchase_quantity ?? 0,
        amount: Number(summary._sum.purchase_total ?? 0),
      },
      sales: sales.map((sale) => ({
        id: sale.id,
        quantity: sale.purchase_quantity,
        total: sale.purchase_total,
        at: sale.purchase_date,
        productName: sale.product?.item_name ?? "Producto",
        customerName:
          `${sale.customer?.firstName ?? ""} ${sale.customer?.lastName ?? ""}`.trim() ||
          sale.customer?.username ||
          "Cliente",
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error obteniendo caja diaria:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin" || !token.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const inputItems = Array.isArray(body?.items) ? body.items : [];

    if (inputItems.length === 0) {
      return NextResponse.json(
        { error: "Debe enviar al menos un producto" },
        { status: 400 }
      );
    }

    const items: DispatchItemInput[] = inputItems
      .map((raw: unknown) => {
        const row = raw as { productId?: unknown; quantity?: unknown };
        return {
          productId: String(row?.productId ?? "").trim(),
          quantity: Number(row?.quantity ?? 0),
        };
      })
      .filter(
        (row: DispatchItemInput) =>
          row.productId.length > 0 &&
          Number.isInteger(row.quantity) &&
          row.quantity > 0
      );

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await prisma.inventoryItem.findMany({
      where: { item_id: { in: productIds } },
      select: {
        item_id: true,
        item_name: true,
        item_price: true,
        item_discount: true,
        item_stock: true,
      },
    });
    const quote = buildSaleQuote(
      products.map((product) => ({
        id: product.item_id,
        name: product.item_name,
        price: product.item_price,
        discountPercent: product.item_discount,
        stock: product.item_stock,
      })),
      items,
    );

    if (!quote.ok) {
      return NextResponse.json(
        { error: "No se pudo despachar la venta", details: quote.issues },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const line of quote.lines) {
        const stockUpdate = await tx.inventoryItem.updateMany({
          where: {
            item_id: line.productId,
            item_stock: { gte: line.quantity },
          },
          data: {
            item_stock: {
              decrement: line.quantity,
            },
          },
        });
        if (stockUpdate.count !== 1) {
          throw new Error(`STOCK_CHANGED:${line.productName}`);
        }

        await tx.purchase.create({
          data: {
            purchase_quantity: line.quantity,
            purchase_total: line.lineTotal,
            customer: {
              connect: { id: token.id as string },
            },
            product: {
              connect: { item_id: line.productId },
            },
          },
        });
      }

      return {
        rows: quote.lines.length,
        totalItems: quote.totalItems,
        grandTotal: quote.grandTotal,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "Venta despachada correctamente",
      result,
    });
  } catch (error) {
    console.error("Error despachando venta en caja diaria:", error);
    if (error instanceof Error && error.message.startsWith("STOCK_CHANGED:")) {
      return NextResponse.json(
        {
          error: "El stock cambió mientras se procesaba la venta",
          details: [error.message.slice("STOCK_CHANGED:".length)],
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
