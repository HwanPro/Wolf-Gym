// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { requestToken } from "@/server/auth/authorization";
import { safeStorageSegment, validateUploadFile, safeUploadBuffer } from "@/server/files/file-validation";
import { inventoryInput } from "@/server/validation/inventory-input";
import { Prisma } from "@prisma/client";
import {discardNewUploadIfUnreferenced} from "@/server/files/upload-recovery";

const DEFAULT_PRODUCT_IMAGE = "/uploads/images/logo2.jpg";

// AWS S3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET: Retrieve products
export async function GET(request: NextRequest) {
  const token = await requestToken(request);

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const products = await prisma.inventoryItem.findMany();
    const normalizedProducts = products.map((product) => ({
      ...product,
      item_image_url: product.item_image_url || DEFAULT_PRODUCT_IMAGE,
    }));
    return NextResponse.json(normalizedProducts, { status: 200 });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return NextResponse.json({ error: "No se pudieron obtener los productos" }, { status: 500 });
  }
}

// POST: Create a new product
export async function POST(req: NextRequest) {
  const token = await requestToken(req);

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let uploadedKey: string | undefined;
  let persisted = false;
  try {
    const data = await req.formData();

    const parsed = inventoryInput.safeParse(Object.fromEntries(data.entries()));
    if (!parsed.success) return NextResponse.json({ error: "Precio, descuento o stock inválidos" }, { status: 400 });
    const { item_name, item_description, item_price, item_discount, item_stock } = parsed.data;
    const isGymProduct     = String(data.get("isGymProduct") ?? "false") === "true"; // <- USADO
    const category         = String(data.get("category") || "general").trim();
    if (category.length > 80) return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
    const file             = data.get("file");

    if (!item_name || !item_description || isNaN(item_price) || isNaN(item_stock)) {
      return NextResponse.json({ error: "Missing or invalid required fields" }, { status: 400 });
    }
    let imageUrl = DEFAULT_PRODUCT_IMAGE;
    if (file !== null) {
    if (!(file instanceof File)) return NextResponse.json({ error: "El archivo no es válido" }, { status: 400 });
    const validationError = validateUploadFile(file, {
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
      maxBytes: 5 * 1024 * 1024,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Sube a S3 (tu código actual) -> imageUrl
    const buffer = await safeUploadBuffer(file);
    if (!buffer) return NextResponse.json({ error: "El contenido del archivo no es válido" }, { status: 400 });
    const uniqueFileName = `${uuidv4()}-${safeStorageSegment(file.name)}`;
    if (process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1") return NextResponse.json({ error: "S3 deshabilitado en local. Cree el producto sin imagen." }, { status: 503 });
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: `uploads/${uniqueFileName}`,
      Body: buffer,
      ContentType: file.type,
    }));
    uploadedKey = `uploads/${uniqueFileName}`;
    imageUrl =
      `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${uniqueFileName}`;
    }

    // Guarda usando los NUEVOS campos
    const newProduct = await prisma.inventoryItem.create({
      data: {
        item_name,
        item_description,
        item_price,
        item_discount,
        item_stock,
        item_image_url: imageUrl,
        item_category: category,
        is_admin_only: isGymProduct, // <- clave para ocultar en público
        track_stock: parsed.data.track_stock ?? true,
        item_sku: parsed.data.item_sku || null,
      },
    });
    persisted = true;

    return NextResponse.json({ message: "Producto creado correctamente", product: newProduct }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "El SKU ya pertenece a otro producto" }, { status: 409 });
    console.error("Error al subir la imagen o guardar el producto:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    if (uploadedKey && !persisted) {
      const key=uploadedKey,url=`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      await discardNewUploadIfUnreferenced(async()=>Boolean(await prisma.inventoryItem.findFirst({where:{item_image_url:url},select:{item_id:true}})),()=>s3Client.send(new DeleteObjectCommand({Bucket:process.env.AWS_BUCKET_NAME!,Key:key})));
    }
  }
}

// Set the runtime if you need Node.js APIs
export const runtime = "nodejs";

// Remove the `export const config` entirely.
// No need for bodyParser or other config properties in App Router routes.
