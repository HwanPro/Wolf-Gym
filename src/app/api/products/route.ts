// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { getToken } from "next-auth/jwt";
import { safeStorageSegment, validateUploadFile } from "@/server/files/file-validation";

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
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const products = await prisma.inventoryItem.findMany();
    const normalizedProducts = products.map((product) => ({
      ...product,
      item_image_url: product.item_image_url || DEFAULT_PRODUCT_IMAGE,
    }));
    return NextResponse.json(normalizedProducts, { status: 200 });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// POST: Create a new product
export async function POST(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await req.formData();

    const item_name        = data.get("item_name") as string;
    const item_description = data.get("item_description") as string;
    const item_price       = parseFloat(String(data.get("item_price")));
    const item_discount    = parseFloat(String(data.get("item_discount") ?? "0")) || 0;
    const item_stock       = parseInt(String(data.get("item_stock") ?? "0"), 10);
    const isGymProduct     = String(data.get("isGymProduct") ?? "false") === "true"; // <- USADO
    const category         = (data.get("category") as string) || "general";         // <- USADO
    const file             = data.get("file");

    if (!item_name || !item_description || isNaN(item_price) || isNaN(item_stock)) {
      return NextResponse.json({ error: "Missing or invalid required fields" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }
    const validationError = validateUploadFile(file, {
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
      maxBytes: 5 * 1024 * 1024,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Sube a S3 (tu código actual) -> imageUrl
    const buffer = Buffer.from(await file.arrayBuffer());
    const uniqueFileName = `${uuidv4()}-${safeStorageSegment(file.name)}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: `uploads/${uniqueFileName}`,
      Body: buffer,
      ContentType: file.type,
    }));
    const imageUrl =
      `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${uniqueFileName}`;

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
      },
    });

    return NextResponse.json({ message: "Product created successfully", product: newProduct });
  } catch (error) {
    console.error("Error uploading to S3 or saving to DB:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Set the runtime if you need Node.js APIs
export const runtime = "nodejs";

// Remove the `export const config` entirely.
// No need for bodyParser or other config properties in App Router routes.
