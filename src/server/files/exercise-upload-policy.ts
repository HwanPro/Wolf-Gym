import { z } from "zod";

export const EXERCISE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EXERCISE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const formats: Record<string, { type: "image" | "video"; extensions: string[] }> = {
  "image/jpeg": { type: "image", extensions: ["jpg", "jpeg"] },
  "image/png": { type: "image", extensions: ["png"] },
  "image/webp": { type: "image", extensions: ["webp"] },
  "video/mp4": { type: "video", extensions: ["mp4"] },
  "video/webm": { type: "video", extensions: ["webm"] },
};

// All direct uploads must declare an exact size and a SHA-256 checksum. S3
// verifies the checksum; the signature binds the request's Content-Length.
export const exerciseUploadSchema = z.object({
  type: z.enum(["image", "video"]),
  contentType: z.string().trim().toLowerCase(),
  filename: z.string().trim().min(1).max(200).regex(/^[^\\/\x00-\x1f]+$/),
  fileSize: z.number().int().positive().max(EXERCISE_VIDEO_MAX_BYTES),
  checksumSHA256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
}).superRefine((data, context) => {
  const format = formats[data.contentType];
  const extension = data.filename.toLowerCase().split(".").pop() || "";
  if (!format || format.type !== data.type || !format.extensions.includes(extension)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Tipo, extensión y categoría deben corresponder", path: ["contentType"] });
  }
  if (data.type === "image" && data.fileSize > EXERCISE_IMAGE_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "La imagen excede 5 MiB", path: ["fileSize"] });
  }
});
