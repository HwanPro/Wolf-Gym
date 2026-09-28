import "dotenv/config";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

async function authenticate(context: BrowserContext, role: "admin" | "client") {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for authenticated E2E tests");
  const value = await encode({
    secret,
    token: { id: `${role}-nutrition-e2e`, sub: `${role}-nutrition-e2e`, role },
  });
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

test("admin nutrition builder remains usable across viewports", async ({ page, context }, testInfo) => {
  await authenticate(context, "admin");
  await page.route("**/api/admin/nutrition/plans", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "plan-1",
            name: "Plan híbrido de rendimiento",
            objective: "PERFORMANCE",
            versions: [
              {
                id: "version-1",
                version: 1,
                mode: "HYBRID",
                energyMode: "MANUAL",
                targetCalories: 2400,
                durationWeeks: 4,
                _count: { assignments: 3, days: 7 },
              },
            ],
          },
        ],
      }),
    }),
  );
  await page.route("**/api/clients", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          user_id: "client-1",
          profile_first_name: "Cliente",
          profile_last_name: "Prueba",
          user: { username: "cliente_prueba", role: "client" },
        },
      ]),
    }),
  );

  await page.goto("/admin/nutrition", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Planes alimentarios" })).toBeVisible();
  await expect(page.getByText("Constructor de plan")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `test-results/nutrition-admin-${testInfo.project.name}.png`, fullPage: true });
});

test("client can read the assigned weekly plan without overflow", async ({ page, context }, testInfo) => {
  await authenticate(context, "client");
  await page.route("**/api/user/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "client-nutrition-e2e",
        username: "cliente_prueba",
        name: "Cliente",
        lastName: "Prueba",
        phoneNumber: "+51999999999",
        image: null,
        role: "client",
        profile: { profile_plan: "Plan Mes", profile_start_date: "2026-09-01", profile_end_date: "2027-09-01", debt: 0 },
        memberships: [{ assignedAt: "2026-09-01", membership: { membership_type: "Plan Mes", membership_duration: 365 } }],
        attendances: [],
      }),
    }),
  );
  await page.route("**/api/nutrition/current", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        assignment: {
          id: "assignment-1",
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-10-01T23:59:59.000Z",
          version: {
            version: 1,
            mode: "HYBRID",
            energyMode: "MANUAL",
            targetCalories: 2300,
            targetProteinG: "150",
            targetCarbohydrateG: "260",
            targetFatG: "70",
            targetFiberG: "30",
            professionalNotes: "Prioriza agua y preparaciones caseras.",
            professionalName: "Nutricionista responsable",
            professionalRegistration: "CNP 0000",
            plan: { name: "Plan semanal de rendimiento", description: "Comidas peruanas prácticas.", objective: "PERFORMANCE" },
            days: [
              {
                id: "day-1",
                dayIndex: new Date().getDay(),
                label: "Hoy",
                meals: [
                  {
                    id: "meal-1",
                    name: "Desayuno",
                    suggestedTime: "08:00",
                    items: [
                      { id: "item-1", name: "Avena con fruta", quantity: "80", unit: "GRAM", displayAmount: "1 bowl", isAlternative: false },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }),
    }),
  );

  await page.goto("/client/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Nutrición" }).click();
  await expect(page.getByRole("heading", { name: "Plan semanal de rendimiento" })).toBeVisible();
  await expect(page.getByText("Avena con fruta")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `test-results/nutrition-client-${testInfo.project.name}.png`, fullPage: true });
});
