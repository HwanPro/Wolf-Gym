import "dotenv/config";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import fs from "node:fs";

type Role = "admin" | "client";

async function authenticate(
  context: BrowserContext,
  role: Role,
  id = `${role}-profile-e2e`,
) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error("NEXTAUTH_SECRET is required for authenticated E2E tests");

  const value = await encode({
    secret,
    token: {
      id,
      sub: id,
      role,
      name: `${role}_profile_e2e`,
      username: `${role}_profile_e2e`,
      firstName: role === "admin" ? "Admin" : "Cliente",
      lastName: "Prueba",
      phoneNumber: "+51999999999",
    },
  });

  // UI fixtures isolate presentation; they do not exercise server authorization.
  await context.route("**/api/auth/session", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ expires: "2099-01-01T00:00:00.000Z", user: { id: id, role: role, name: "usuario_e2e", firstName: "Cliente", lastName: "Prueba" } }),
  }));
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("configured admin credentials complete the real login flow", async ({
  page,
}) => {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(
    !username || !password,
    "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run real authentication",
  );

  await page.goto("/auth/login");
  await page.locator('input[name="username"]').fill(username!);
  await page.locator('input[name="password"]').fill(password!);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 });
});

test("admin profile loads, exposes profile editing and stays responsive", async ({
  page,
  context,
}) => {
  await authenticate(context, "admin");
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin-profile-e2e",
        username: "admin_profile_e2e",
        firstName: "Admin",
        lastName: "Prueba",
        phoneNumber: "+51999999999",
        image: null,
        role: "admin",
        profile: { profile_emergency_phone: "+51911111111" },
      }),
    }),
  );

  await page.goto("/admin/profile", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "PERFIL DE ADMINISTRADOR" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Editar perfil/i }),
  ).toBeVisible();
  await expect(
    page.getByText("Acceso completo al panel de administración"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("client dashboard and profile controls load without overflow", async ({
  page,
  context,
}) => {
  await authenticate(context, "client");
  await page.route("**/api/user/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "client-profile-e2e",
        username: "cliente_profile_e2e",
        name: "Cliente",
        lastName: "Prueba",
        phoneNumber: "+51999999999",
        image: null,
        role: "client",
        profile: {
          profile_first_name: "Cliente",
          profile_last_name: "Prueba",
          profile_phone: "+51999999999",
          profile_plan: "Plan Mes",
          profile_start_date: "2026-09-01T00:00:00.000Z",
          profile_end_date: "2027-09-01T00:00:00.000Z",
          documentNumber: "12345678",
          debt: 0,
        },
        memberships: [
          {
            assignedAt: "2026-09-01T00:00:00.000Z",
            membership: {
              membership_type: "Plan Mes",
              membership_duration: 365,
            },
          },
        ],
        attendances: [],
      }),
    }),
  );

  await page.goto("/client/dashboard", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Hola, Cliente" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Editar perfil" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Rutinas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nutrición" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("inactive clients see a locked routine preview without overflow", async ({
  page,
  context,
}) => {
  await authenticate(context, "client", "inactive-client-e2e");
  await page.route("**/api/user/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "inactive-client-e2e",
        username: "inactive_client_e2e",
        name: "Cliente",
        lastName: "Inactivo",
        phoneNumber: "+51999999999",
        image: null,
        role: "client",
        profile: {
          profile_first_name: "Cliente",
          profile_last_name: "Inactivo",
          profile_phone: "+51999999999",
          profile_plan: "Plan Mes",
          profile_start_date: "2026-01-01T00:00:00.000Z",
          profile_end_date: "2026-02-01T00:00:00.000Z",
          debt: 0,
        },
        memberships: [],
        attendances: [],
      }),
    }),
  );

  await page.goto("/client/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("Membresía no activa")).toBeVisible();
  await expect(page.getByText("Vista previa", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Activa tu membresía para abrir las rutinas"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("security profile exposes recovery, password and 2FA controls responsively", async ({
  page,
  context,
}) => {
  await authenticate(context, "client");
  await page.goto("/profile/security", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Configuración de Seguridad" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar contraseña" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Configurar 2FA" }),
  ).toBeVisible();
  await expect(page.getByText("Recomendación de Seguridad")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("role boundaries redirect users to their own dashboard", async ({
  page,
  context,
}) => {
  const accounts = JSON.parse(fs.readFileSync(".local/test-accounts.json", "utf8")).accounts as { role: string; username: string; password: string }[];
  const realLogin = async (role: string) => {
    const account = accounts.find(row => row.role === role)!;
    const csrf = await (await context.request.get("/api/auth/csrf")).json();
    await context.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, username: account.username, password: account.password, json: "true", callbackUrl: "/" } });
  };
  await realLogin("client");
  await page.goto("/admin/profile");
  await expect(page).toHaveURL(/\/client\/dashboard$/);

  await context.clearCookies();
  await realLogin("admin");
  await page.goto("/client/dashboard");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});
