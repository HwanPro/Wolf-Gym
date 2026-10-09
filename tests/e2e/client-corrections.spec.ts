import { expect, test } from "@playwright/test";

// These UI fixtures never read the physical scanner or change a client's data.
test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", { form: {
    csrfToken: csrf.csrfToken, username: process.env.E2E_ADMIN_USERNAME!,
    password: process.env.E2E_ADMIN_PASSWORD!, json: "true",
  } });
  await page.route("**/api/clients", route => route.fulfill({ json: [{
    profile_id: "client-profile-regression", user_id: "client-user-regression",
    profile_first_name: "Cliente Original", profile_last_name: "Prueba",
    profile_plan: "Plan Mes", profile_start_date: "2026-10-01", profile_end_date: "2026-11-01",
    user: { username: "client_regression", role: "client", fingerprints: [{ id: "fixture" }], attendances: [] },
  }] }));
  await page.goto("/admin/clients");
  await expect(page.getByText("Cliente Original Prueba", { exact: true })).toBeVisible();
});

for (const close of ["Cancelar", "Cerrar", "Escape"]) {
  test(`discard client edits on ${close}`, async ({ page }) => {
    let writes = 0;
    page.on("request", r => { if (r.method() === "PUT" && r.url().includes("/api/clients/")) writes++; });
    const edit = page.getByRole("button", { name: /^(Editar|Editar cliente)$/ });
    await edit.click();
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Cambio sin guardar");
    if (close === "Escape") await page.getByRole("textbox", { name: "Nombre", exact: true }).press("Escape");
    else await page.getByRole("button", { name: close, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Editar cliente" })).toHaveCount(0);
    await edit.click();
    await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue("Cliente Original");
    expect(writes).toBe(0);
  });
}

test("declining discard preserves unsaved client edits", async ({ page }) => {
  page.removeAllListeners("dialog");
  await page.getByRole("button", { name: /^(Editar|Editar cliente)$/ }).click();
  const name = page.getByRole("textbox", { name: "Nombre", exact: true });
  await name.fill("Cambio importante sin guardar");
  let warning = "";
  page.once("dialog", async dialog => { warning = dialog.message(); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(name).toHaveValue("Cambio importante sin guardar");
  expect(warning).toContain("cambios sin guardar");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Editar cliente" })).toHaveCount(0);
});

for (const failure of ["no-match", "unavailable"]) {
  test(`verification never flashes success for ${failure}`, async ({ page }) => {
    await page.route("**/api/biometric/capture", route => route.fulfill({ json: { ok: true, template: Buffer.from("synthetic").toString("base64") } }));
    await page.route("**/api/biometric/verify/*", route => route.fulfill({
      status: failure === "unavailable" ? 503 : 200,
      json: failure === "unavailable" ? { ok: false, message: "No se pudo completar la verificación biométrica." } : { ok: true, match: false },
    }));
    await page.getByRole("button", { name: /^(Verificar|Verificar huella)$/ }).click();
    await expect(page.getByText(failure === "unavailable" ? "No se pudo completar la verificación biométrica." : "La huella no coincide", { exact: true })).toBeVisible();
    await expect(page.getByText("Identidad verificada", { exact: true })).toHaveCount(0);
  });
}

for (const failure of [
  { name: "duplicate", status: 409, message: "Esta huella ya está registrada en otro cliente. Usa un dedo diferente." },
  { name: "mixed-samples", status: 400, message: "Las muestras no corresponden al mismo dedo. Repite las tres muestras usando un solo dedo." },
]) {
test(`${failure.name} enrollment shows the error and restores accessible page controls`, async ({ page }) => {
  await page.route("**/api/biometric/status/*", route => route.fulfill({ json: { ok: true, hasFingerprint: false } }));
  await page.route("**/api/biometric/capture", route => route.fulfill({ json: { ok: true, template: Buffer.from("synthetic").toString("base64") } }));
  await page.route("**/api/biometric/register/*", route => route.fulfill({ status: failure.status, json: { ok: false, message: failure.message } }));
  await page.getByRole("button", { name: /^(Reemplazar huella|Registrar huella)$/ }).click();
  // Three preparation intervals total 4.8s, plus the reader-dialog closing animation.
  await expect(page.getByText(failure.message, { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByRole("button", { name: /^(Verificar|Verificar huella)$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refrescar", exact: true })).toBeEnabled();
});
}

for (const operation of ["enrollment", "verification"]) {
  test(`cancel ${operation} discards a late capture and permits a new operation`, async ({ page }) => {
    let registrations = 0;
    let verifications = 0;
    await page.route("**/api/biometric/status/*", route => route.fulfill({ json: { ok: true, hasFingerprint: false } }));
    await page.route("**/api/biometric/capture", async route => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fulfill({ json: { ok: true, template: Buffer.from("synthetic").toString("base64") } }).catch(() => {});
    });
    await page.route("**/api/biometric/register/*", async route => { registrations++; await route.fulfill({ json: { ok: true } }); });
    await page.route("**/api/biometric/verify/*", async route => { verifications++; await route.fulfill({ json: { ok: true, match: true } }); });
    await page.getByRole("button", { name: operation === "enrollment" ? /^(Reemplazar huella|Registrar huella)$/ : /^(Verificar|Verificar huella)$/ }).click();
    await expect(page.getByText(operation === "enrollment" ? "Capturando muestra 1 de 3" : "Leyendo huella", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Detener lectura de huella", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(registrations).toBe(0);
    expect(verifications).toBe(0);
    await expect(page.getByText("Identidad verificada", { exact: true })).toHaveCount(0);
    const verify = page.getByRole("button", { name: /^(Verificar|Verificar huella)$/ });
    await expect(verify).toBeEnabled();
    await verify.click();
    await expect(page.getByRole("button", { name: "Detener lectura de huella" })).toBeVisible();
    await page.getByRole("button", { name: "Detener lectura de huella" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
