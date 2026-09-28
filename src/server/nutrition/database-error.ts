import { NextResponse } from "next/server";

export function nutritionDatabaseError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code !== "P2021" && code !== "P2022") return null;

  return NextResponse.json(
    {
      code: "NUTRITION_SCHEMA_NOT_READY",
      error:
        "El módulo de nutrición todavía no está activado en esta base de datos. Aplica la migración pendiente y vuelve a intentar.",
    },
    { status: 503 },
  );
}
