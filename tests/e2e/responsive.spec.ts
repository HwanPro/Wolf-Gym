import { expect, test } from "@playwright/test";
import axe from "axe-core";

const routes = [
  { path: "/", landmark: /Wolf Gym|Entrena/i },
  { path: "/auth/login", landmark: /Inicia sesión/i },
  { path: "/auth/register", landmark: /Crear cuenta|Regístrate|Registro/i },
  { path: "/products/public", landmark: /Productos|Tienda/i },
  { path: "/check-in", landmark: /Check.?in|Control de acceso|Wolf Gym/i },
];

for (const route of routes) {
  test(`${route.path} is usable without horizontal overflow`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(route.landmark).first()).toBeVisible({ timeout: 15_000 });

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () => {
      const runner = (window as typeof window & { axe: typeof axe }).axe;
      return runner.run(document, {
        resultTypes: ["violations"],
        rules: {
          "color-contrast": { enabled: false },
        },
      });
    });
    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
  });
}
