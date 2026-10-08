import { expect, test } from "@playwright/test";

// UI fixtures model capture/comparison responses; no physical reading or
// attendance/debt writes take place in these regression cases.
test.beforeEach(async ({ page }) => {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", { form: {
    csrfToken: csrf.csrfToken, username: process.env.E2E_ADMIN_USERNAME!,
    password: process.env.E2E_ADMIN_PASSWORD!, json: "true",
  } });
  await page.route("**/api/biometric/capture", route => route.fulfill({
    json: { ok: true, template: Buffer.from("synthetic-ui-test").toString("base64") },
  }));
});

for (const action of [/Marcar Entrada/, /Marcar Salida/, /Registrar deuda/]) {
  test(`service errors stay visible when using ${action.source}`, async ({ page }) => {
    await page.route("**/api/biometric/identify", route => route.fulfill({
      status: 503, json: { ok: false, match: false, message: "El servicio biométrico no pudo comparar las huellas." },
    }));
    let writes = 0;
    page.on("request", request => {
      if (request.method() === "POST" && /\/api\/(check-in|debts)$/.test(new URL(request.url()).pathname)) writes++;
    });
    await page.goto("/check-in");
    await page.getByRole("button", { name: action }).click();
    await expect(page.getByText("El servicio biométrico no pudo comparar las huellas.", { exact: true })).toBeVisible();
    await expect(page.getByText(/No te reconocimos/)).toHaveCount(0);
    expect(writes).toBe(0);
  });
}

test("a genuine no-match still offers manual identification", async ({ page }) => {
  await page.route("**/api/biometric/identify", route => route.fulfill({ json: { ok: true, match: false } }));
  await page.goto("/check-in");
  await page.getByRole("button", { name: /Marcar Entrada/ }).click();
  await expect(page.getByText("No te reconocimos. Registra por DNI o teléfono", { exact: true })).toBeVisible();
});
