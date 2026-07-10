// src/app/api/products/public/route.ts

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { buildSaleQuote } from "@/domain/sales/sale-policy";
import { authorizeRequest } from "@/server/auth/authorization";

const DEFAULT_PRODUCT_IMAGE = "/uploads/images/logo2.jpg";

// GET - Obtener productos disponibles para los clientes
export async function GET(req: NextRequest) {
  try {
    const products = await prisma.inventoryItem.findMany({
      where: {
        item_stock: {
          gt: 0,
        },
        is_admin_only: false, // Solo productos públicos
      },
      select: {
        item_id: true,
        item_name: true,
        item_description: true,
        item_price: true,
        item_discount: true,
        item_image_url: true,
        item_stock: true, // Asegúrate de incluir esto
      },
    });

    const normalizedProducts = products.map((product) => ({
      ...product,
      item_image_url: product.item_image_url || DEFAULT_PRODUCT_IMAGE,
    }));

    return NextResponse.json(normalizedProducts);
  } catch (error) {
    console.error("Error al obtener los productos públicos:", error);
    return NextResponse.json(
      { error: "Error al obtener los productos" },
      { status: 500 }
    );
  }
}


// POST - Procesar una compra
export async function POST(req: NextRequest) {
  const authorization = await authorizeRequest(req, ["client", "admin"]);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await req.json();
    const productId = String(body?.productId || "").trim();
    const quantity = Number(body?.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Faltan datos para procesar la compra" },
        { status: 400 }
      );
    }

    // Verificar si el producto existe y tiene stock suficiente
    const product = await prisma.inventoryItem.findUnique({
      where: { item_id: productId },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    if (product.is_admin_only) {
      return NextResponse.json(
        { error: "Producto no disponible" },
        { status: 404 }
      );
    }

    const quote = buildSaleQuote(
      [{
        id: product.item_id,
        name: product.item_name,
        price: product.item_price,
        discountPercent: product.item_discount,
        stock: product.item_stock,
      }],
      [{ productId, quantity }],
    );
    if (!quote.ok) {
      return NextResponse.json(
        { error: "No se pudo procesar la compra", details: quote.issues },
        { status: 400 },
      );
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.updateMany({
        where: { item_id: productId, item_stock: { gte: quantity } },
        data: { item_stock: { decrement: quantity } },
      });
      if (updated.count !== 1) throw new Error("STOCK_CHANGED");

      return tx.purchase.create({
        data: {
          purchase_quantity: quantity,
          purchase_total: quote.grandTotal,
          customer: { connect: { id: authorization.token.id as string } },
          product: { connect: { item_id: productId } },
        },
      });
    });
    

    return NextResponse.json({ purchase }, { status: 201 });
  } catch (error) {
    console.error("Error al procesar la compra:", error);
    if (error instanceof Error && error.message === "STOCK_CHANGED") {
      return NextResponse.json(
        { error: "El stock cambió mientras se procesaba la compra" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Error al procesar la compra" },
      { status: 500 }
    );
  }
}
