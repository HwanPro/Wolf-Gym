import "dotenv/config";

import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import ExcelJS from "exceljs";

async function authenticateAdmin(context: BrowserContext) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for authenticated E2E tests");
  const value = await encode({
    secret,
    token: { id: "admin-report-e2e", sub: "admin-report-e2e", role: "admin" },
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

const report = {
  generatedAt: "2026-09-28T20:00:00.000Z",
  overview: {
    totalIncome: 2500,
    productSales: 340,
    newClients: 8,
    todayAttendance: 21,
    activeMemberships: 82,
  },
  trends: {
    incomeTrend: [{ period: "2026-09", total: 2500 }],
    attendanceTrend: [{ day: "2026-09-28", count: 21 }],
  },
  inventory: { totalProducts: 15, lowStockProducts: 2, outOfStockProducts: 0 },
  debts: { clientsWithDebt: 3, totalDebt: 120, dailyDebtsCount: 2, debtHistoryCount: 1 },
  distributions: {
    planDistribution: [{ plan: "Mensual", count: 82 }],
    topProducts: [{ productId: "p1", name: "Agua", revenue: 40, quantity: 10 }],
  },
  dataQuality: {
    score: 97,
    issueCount: 1,
    inconsistencies: [
      {
        id: "partial_membership_dates",
        title: "Fechas de membresía incompletas",
        severity: "medium",
        count: 1,
        description: "Falta una de las fechas.",
        samples: ["Cliente Prueba: falta fecha de fin"],
      },
    ],
  },
};

test("admin exports a structured Excel workbook", async ({ page, context }) => {
  await authenticateAdmin(context);
  await page.route("**/api/admin/reports", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(report) }),
  );

  await page.goto("/admin/reportes", { waitUntil: "networkidle" });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^wolf-gym-reporte-.*\.xlsx$/);

  const path = await download.path();
  expect(path).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path!);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    "Resumen",
    "Ingresos",
    "Asistencia",
    "Planes",
    "Productos",
    "Calidad de datos",
  ]);
  expect(workbook.getWorksheet("Resumen")?.getCell("A1").value).toBe(
    "WOLF GYM · REPORTE ADMINISTRATIVO",
  );
  expect(workbook.getWorksheet("Calidad de datos")?.getCell("B4").value).toBe(
    "Fechas de membresía incompletas",
  );
});
