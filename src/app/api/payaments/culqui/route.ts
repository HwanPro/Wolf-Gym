import { PaymentMethod, PaymentStatus } from "@prisma/client";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildSaleQuote } from "@/domain/sales/sale-policy";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";

const chargeSchema = z.object({
  token: z.string().trim().min(1).max(200),
  email: z.string().email().max(254),
  description: z.string().trim().min(1).max(120),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().positive().max(100),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, ["admin", "client"]);
  if (!authorization.authorized) return authorization.response;

  const parsed = chargeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de pago inválidos" }, { status: 400 });
  }

  const privateKey = process.env.CULQI_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { error: "El servicio de pagos no está configurado" },
      { status: 503 },
    );
  }

  const userId = String(authorization.token.id || authorization.token.sub || "");
  if (!userId) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
  const products = await prisma.inventoryItem.findMany({
    where: { item_id: { in: productIds }, is_admin_only: false },
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
    parsed.data.items,
  );
  if (!quote.ok) {
    return NextResponse.json(
      { error: "No se pudo preparar la compra", details: quote.issues },
      { status: 400 },
    );
  }

  const amountCents = Math.round(quote.grandTotal * 100);
  let paymentId: number;
  try {
    const payment = await prisma.$transaction(async (transaction) => {
      for (const line of quote.lines) {
        const reserved = await transaction.inventoryItem.updateMany({
          where: {
            item_id: line.productId,
            is_admin_only: false,
            item_stock: { gte: line.quantity },
          },
          data: { item_stock: { decrement: line.quantity } },
        });
        if (reserved.count !== 1) throw new Error("STOCK_CHANGED");
      }

      return transaction.paymentRecord.create({
        data: {
          payer_user_id: userId,
          payment_amount: quote.grandTotal,
          currency: "PEN",
          note: parsed.data.description,
          payment_status: PaymentStatus.PENDING,
          payment_method: PaymentMethod.CARD,
        },
      });
    });
    paymentId = payment.payment_id;
  } catch (error) {
    if (error instanceof Error && error.message === "STOCK_CHANGED") {
      return NextResponse.json(
        { error: "El stock cambió mientras se preparaba el pago" },
        { status: 409 },
      );
    }
    console.error("No se pudo reservar la compra:", error);
    return NextResponse.json({ error: "No se pudo preparar el pago" }, { status: 500 });
  }

  let charge;
  try {
    charge = await axios.post(
      "https://api.culqi.com/v2/charges",
      {
        amount: amountCents,
        currency_code: "PEN",
        email: parsed.data.email,
        source_id: parsed.data.token,
        description: parsed.data.description,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${privateKey}`,
        },
        timeout: 20_000,
      },
    );

  } catch (error) {
    console.error(
      "Error procesando el pago Culqi:",
      axios.isAxiosError(error) ? error.response?.data : error,
    );
    try {
      await prisma.$transaction([
        ...quote.lines.map((line) =>
          prisma.inventoryItem.update({
            where: { item_id: line.productId },
            data: { item_stock: { increment: line.quantity } },
          }),
        ),
        prisma.paymentRecord.update({
          where: { payment_id: paymentId },
          data: { payment_status: PaymentStatus.FAILED },
        }),
      ]);
    } catch (compensationError) {
      console.error("No se pudo compensar la reserva fallida:", compensationError);
    }
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 502 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.paymentRecord.update({
        where: { payment_id: paymentId },
        data: {
          payment_status: PaymentStatus.COMPLETED,
          externalRef: String(charge.data?.id || ""),
        },
      });
      for (const line of quote.lines) {
        await transaction.purchase.create({
          data: {
            purchase_quantity: line.quantity,
            purchase_total: line.lineTotal,
            customerId: userId,
            productId: line.productId,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      paymentId,
      chargeId: charge.data?.id ?? null,
      total: quote.grandTotal,
    });
  } catch (error) {
    console.error("Pago recibido pendiente de conciliación:", {
      paymentId,
      chargeId: charge.data?.id ?? null,
      error,
    });
    return NextResponse.json(
      { error: "Pago recibido y pendiente de confirmación", paymentId },
      { status: 500 },
    );
  }
}
