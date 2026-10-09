// src/app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { safeStorageSegment, validateUploadFile, safeUploadBuffer } from "@/server/files/file-validation";
import { assertExternalWrites } from "@/server/security/external-writes";
import { requireAdmin } from "@/server/auth/authorization";
import { inventoryInput } from "@/server/validation/inventory-input";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {discardNewUploadIfUnreferenced} from "@/server/files/upload-recovery";


const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

type ContextParams = {
  params: Promise<{
    id: string;
  }>;
};

// Eliminar producto por ID
export async function DELETE(req: NextRequest, context: ContextParams) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "ID del producto no proporcionado" },
        { status: 400 }
      );
    }

    const product = await prisma.inventoryItem.findUnique({
      where: { item_id: id },
    });

    if (!product) {
      return NextResponse.json(
        { error: `Producto con ID ${id} no encontrado` },
        { status: 404 }
      );
    }

    const used = await prisma.purchase.count({ where: { productId: id } });
    const owed = await prisma.dailyDebt.count({ where: { productId: id } });
    if (used || owed) return NextResponse.json({ error: "Este producto tiene movimientos. Conserve el registro y ajuste su stock o visibilidad." }, { status: 409 });
    if (process.env.WOLF_DISABLE_EXTERNAL_WRITES !== "1" && product.item_image_url?.startsWith("https")) {
      const s3Key = product.item_image_url.split("/uploads/")[1];
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: `uploads/${s3Key}`,
        })
      );
    }

    await prisma.inventoryItem.delete({ where: { item_id: id } });

    return NextResponse.json(
      { message: "Producto eliminado correctamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error(`Error al eliminar el producto con ID ${(await context.params).id}:`, error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// Actualizar producto por ID
export async function PUT(req: NextRequest, context: ContextParams) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  let uploadedKey: string | undefined;
  let persisted = false;
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "ID del producto no proporcionado" },
        { status: 400 }
      );
    }

    const multipart = req.headers.get("content-type")?.includes("multipart/form-data") ? await req.formData() : null;
    const parsed = inventoryInput.extend({ expectedUpdatedAt: z.string().datetime().optional() }).safeParse(multipart ? Object.fromEntries(multipart.entries()) : await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Precio, descuento o stock inválidos" }, { status: 400 });
    if (!parsed.data.expectedUpdatedAt) return NextResponse.json({ error: "Recargue el catálogo antes de editar el producto" }, { status: 428 });
    const { item_name, item_description, item_price, item_discount, item_stock, item_category, item_sku, track_stock } = parsed.data;

    const product = await prisma.inventoryItem.findUnique({ where: { item_id: id } });

    if (!product) {
      return NextResponse.json(
        { error: `Producto con ID ${id} no encontrado` },
        { status: 404 }
      );
    }

    if (product.item_updated_at.toISOString() !== parsed.data.expectedUpdatedAt) return NextResponse.json({ error: "El producto cambió. Recargue el catálogo antes de editarlo." }, { status: 409 });
    let imageUrl: string | undefined;
    if (multipart?.has("file")) {
      const file = multipart.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
      const validationError = validateUploadFile(file, { allowedTypes: ["image/jpeg", "image/png", "image/webp"], allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"], maxBytes: 5 * 1024 * 1024 });
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
      const buffer = await safeUploadBuffer(file);
      if (!buffer) return NextResponse.json({ error: "Contenido de imagen inválido" }, { status: 400 });
      assertExternalWrites();
      const key = `uploads/${randomUUID()}-${safeStorageSegment(file.name)}`;
      await s3Client.send(new PutObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: key, Body: buffer, ContentType: file.type }));
      uploadedKey = key;
      imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    }

    const result = await prisma.inventoryItem.updateMany({
      where: { item_id: id, item_updated_at: new Date(parsed.data.expectedUpdatedAt) },
      data: {
        item_name,
        item_description,
        item_price,
        item_discount,
        item_stock,
        item_category,
        item_sku: item_sku === "" ? null : item_sku,
        track_stock,
        ...(imageUrl ? { item_image_url: imageUrl } : {}),
      },
    });
    if (result.count !== 1) return NextResponse.json({ error: "El producto cambió por una venta u otra edición. Recargue el catálogo y revise los valores actuales." }, { status: 409 });
    persisted = true;
    const updatedProduct = await prisma.inventoryItem.findUnique({ where: { item_id: id } });

    return NextResponse.json(
      { message: "Producto actualizado correctamente", product: updatedProduct },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "El SKU ya pertenece a otro producto" }, { status: 409 });
    console.error(`Error al actualizar el producto con ID ${(await context.params).id}:`, error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  } finally {
    if (uploadedKey && !persisted) {
      const key=uploadedKey,url=`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      await discardNewUploadIfUnreferenced(async()=>Boolean(await prisma.inventoryItem.findFirst({where:{item_image_url:url},select:{item_id:true}})),()=>s3Client.send(new DeleteObjectCommand({Bucket:process.env.AWS_BUCKET_NAME!,Key:key})));
    }
  }
}
