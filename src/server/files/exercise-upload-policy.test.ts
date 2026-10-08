import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { exerciseUploadSchema, EXERCISE_IMAGE_MAX_BYTES, EXERCISE_VIDEO_MAX_BYTES } from "./exercise-upload-policy";

const image = { type: "image", contentType: "image/png", filename: "photo.png", fileSize: 100, checksumSHA256: createHash("sha256").update("fixture").digest("base64") };
describe("direct exercise upload boundary", () => {
  it.each([
    { ...image, filename: "photo.png.exe" },
    { ...image, contentType: "video/mp4", filename: "movie.mp4" },
    { ...image, fileSize: EXERCISE_IMAGE_MAX_BYTES + 1 },
    { ...image, fileSize: 100 * 1024 * 1024 },
    { ...image, fileSize: 0 },
    { ...image, fileSize: 1.5 },
    { ...image, fileSize: undefined },
    { ...image, checksumSHA256: undefined },
    { ...image, checksumSHA256: "not-a-checksum" },
    { ...image, filename: "../photo.png" },
    { ...image, type: "video", contentType: "video/mov", filename: "movie.mov" },
  ])("rejects unsafe metadata before creating a signed request (%#)", value => {
    expect(exerciseUploadSchema.safeParse(value).success).toBe(false);
  });
  it("accepts bounded matching formats and SHA-256", () => {
    expect(exerciseUploadSchema.safeParse(image).success).toBe(true);
    expect(exerciseUploadSchema.safeParse({ ...image, type: "video", contentType: "video/webm", filename: "movie.webm", fileSize: EXERCISE_VIDEO_MAX_BYTES }).success).toBe(true);
  });
});
