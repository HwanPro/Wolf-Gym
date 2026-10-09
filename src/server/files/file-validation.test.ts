import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  safeStorageSegment,
  validateUploadFile,
  safeUploadBuffer,
} from "./file-validation";

describe("file upload validation", () => {
  it("accepts a matching MIME type, extension and bounded size", () => {
    const file = new File(["image"], "client photo.PNG", { type: "image/png" });
    expect(
      validateUploadFile(file, {
        allowedTypes: ["image/png"],
        allowedExtensions: [".png"],
        maxBytes: 100,
      }),
    ).toBeNull();
  });

  it("rejects mismatched extensions, MIME types, empty and oversized files", () => {
    const options = {
      allowedTypes: ["image/png"],
      allowedExtensions: [".png"],
      maxBytes: 4,
    };
    expect(validateUploadFile(new File([], "x.png", { type: "image/png" }), options)).toBeTruthy();
    expect(validateUploadFile(new File(["12345"], "x.png", { type: "image/png" }), options)).toBeTruthy();
    expect(validateUploadFile(new File(["x"], "x.exe", { type: "image/png" }), options)).toBeTruthy();
    expect(validateUploadFile(new File(["x"], "x.png", { type: "text/plain" }), options)).toBeTruthy();
  });

  it("turns user-controlled path segments into safe S3 key fragments", () => {
    expect(safeStorageSegment("../../users\\admin")).toBe("users-admin");
    expect(safeStorageSegment("  foto de perfil.PNG  ")).toBe("foto-de-perfil.PNG");
    expect(safeStorageSegment("***")).toBe("file");
  });
});

describe("uploaded content verification", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes and re-encodes valid %s images", async format => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    const file = new File([new Uint8Array(image)], "photo." + format, { type: "image/" + format });
    const result = await safeUploadBuffer(file);
    expect(result).not.toBeNull();
    expect((await sharp(result!).metadata()).format).toBe(format);
  });

  it("rejects fake images, mismatched MIME and non-file form fields", async () => {
    expect(await safeUploadBuffer(new File(["<script>alert(1)</script>"], "fake.png", { type: "image/png" }))).toBeNull();
    const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    expect(await safeUploadBuffer(new File([new Uint8Array(image)], "fake.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(await safeUploadBuffer(new File([new Uint8Array(image)], "fake.svg", { type: "image/svg+xml" }))).toBeNull();
    expect(validateUploadFile("fake" as unknown as File, { allowedTypes: ["image/png"], allowedExtensions: [".png"], maxBytes: 100 })).toBeTruthy();
  });

  it("requires a PDF signature for PDF uploads", async () => {
    expect(await safeUploadBuffer(new File(["<html>fake</html>"], "fake.pdf", { type: "application/pdf" }))).toBeNull();
    expect(await safeUploadBuffer(new File(["%PDF-1.4\n%%EOF"], "document.pdf", { type: "application/pdf" }))).not.toBeNull();
  });
});
