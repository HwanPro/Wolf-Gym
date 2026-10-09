export function assertExternalWrites() {
  if (process.env.WOLF_DISABLE_EXTERNAL_WRITES === "1") throw new Error("Servicios externos deshabilitados en la ejecución local");
}
