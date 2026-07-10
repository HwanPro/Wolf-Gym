import { describe, expect, it } from "vitest";

import {
  safeStorageSegment,
  validateUploadFile,
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
