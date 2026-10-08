import sharp from "sharp";

export type UploadValidationOptions = {
  allowedTypes: readonly string[];
  allowedExtensions: readonly string[];
  maxBytes: number;
};

export function safeStorageSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[-.]+|[-.]+$/g, "")
    .replace(/-+/g, "-");
  return sanitized || "file";
}

export function validateUploadFile(
  file: File,
  options: UploadValidationOptions,
) {
  if (!(file instanceof File)) return "El archivo no es válido";
  if (file.size <= 0) return "El archivo está vacío";
  if (file.size > options.maxBytes)
    return "El archivo excede el tamaño permitido";

  const contentType = file.type.toLowerCase();
  if (
    !options.allowedTypes
      .map((type) => type.toLowerCase())
      .includes(contentType)
  ) {
    return "El tipo de archivo no está permitido";
  }

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (
    !extension ||
    !options.allowedExtensions
      .map((candidate) => candidate.toLowerCase())
      .includes(extension)
  ) {
    return "La extensión del archivo no está permitida";
  }

  return null;
}

// Decode and re-encode images to verify their content and strip metadata/trailing payloads.
export async function safeUploadBuffer(file: File): Promise<Buffer | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-" ? buffer : null;
  }
  try {
    const image = sharp(buffer, {
      limitInputPixels: 40_000_000,
      failOn: "error",
    });
    const metadata = await image.metadata();
    const expected = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    }[file.type];
    if (!expected || metadata.format !== expected) return null;
    if (expected === "jpeg") return await image.rotate().jpeg().toBuffer();
    if (expected === "png") return await image.rotate().png().toBuffer();
    return await image.rotate().webp().toBuffer();
  } catch {
    return null;
  }
}
