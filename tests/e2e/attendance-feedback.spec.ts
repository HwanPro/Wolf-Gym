import { expect, test } from "@playwright/test";

for (const type of ["rebote", "already_open"]) {
  test(`repeated attendance ${type} does not announce a new entry`, async ({ page }) => {
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    await page.request.post("/api/auth/callback/credentials", { form: {
      csrfToken: csrf.csrfToken, username: process.env.E2E_ADMIN_USERNAME!,
      password: process.env.E2E_ADMIN_PASSWORD!, json: "true",
    } });
    await page.route("**/api/biometric/capture", route => route.fulfill({ json: {
      ok: true, template: Buffer.from("synthetic attendance feedback").toString("base64"),
    } }));
    await page.route("**/api/biometric/identify", route => route.fulfill({ json: {
      ok: true, match: true, userId: "synthetic-user", name: "Cliente Feedback Prueba",
    } }));
    await page.route("**/api/check-in", route => route.fulfill({ json: {
      ok: true, action: type === "rebote" ? "checkin" : "already_open", type,
      fullName: "Cliente Feedback Prueba", plan: "Plan Mes", daysLeft: 10,
    } }));
    await page.goto("/check-in");
    await page.getByRole("button", { name: "👆 Marcar Entrada", exact: true }).click();
    await expect(page.getByRole("heading", {
      name: type === "rebote" ? "Registro ya tomado" : "Entrada ya abierta", exact: true,
    })).toBeVisible();
    await expect(page.getByRole("heading", { name: /¡Bienvenido/ })).toHaveCount(0);
    await expect(page.getByText("Entrada registrada", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByText("Cliente Feedback Prueba", { exact: true })).toHaveCount(0);
  });
}
