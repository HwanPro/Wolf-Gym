import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import { loadLocalEnvironment } from "./scripts/lib/local-database.mjs";
loadLocalEnvironment();
const fixture = JSON.parse(fs.readFileSync(".local/test-accounts.json", "utf8"));
const admin = fixture.accounts.find((account: { role: string }) => account.role === "admin");
process.env.E2E_ADMIN_USERNAME = admin.username;
process.env.E2E_ADMIN_PASSWORD = admin.password;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-portrait",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-landscape",
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "node scripts/local-next.mjs dev 3100 .next-e2e",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
