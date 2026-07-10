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
  if (file.size <= 0) return "El archivo está vacío";
  if (file.size > options.maxBytes) return "El archivo excede el tamaño permitido";

  const contentType = file.type.toLowerCase();
  if (!options.allowedTypes.map((type) => type.toLowerCase()).includes(contentType)) {
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
