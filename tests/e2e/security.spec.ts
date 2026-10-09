import { expect, test } from "@playwright/test";
import "dotenv/config";
import { encode } from "next-auth/jwt";

test("protected pages redirect unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/check-in");
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/check-in/display");
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.goto("/profile/security");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("sensitive API mutations reject missing sessions before touching data", async ({ request }) => {
  const responses = await Promise.all([
    request.get("/api/attendance"),
    request.post("/api/plans", { data: { name: "X", price: 1 } }),
    request.put("/api/products/not-a-real-id", { data: {} }),
    request.post("/api/auth/2FA", { data: {} }),
    request.post("/api/commands", { data: { action: "scan" } }),
    request.post("/api/products/public", {
      data: { productId: "x", quantity: 1, customerId: "another-user" },
    }),
    request.post("/api/payments/culqi", {
      data: {
        token: "token",
        email: "client@example.com",
        description: "Compra",
        items: [{ productId: "x", quantity: 1 }],
      },
    }),
  ]);

  expect(responses.map((response) => response.status())).toEqual([
    401, 401, 401, 401, 401, 401, 401,
  ]);
});

test("all pages receive baseline security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(response.headers()["permissions-policy"]).toContain("camera=(self)");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("attendance, biometric templates and streams reject anonymous access", async ({ request }) => {
  const responses = await Promise.all([
    request.post("/api/check-in", { data: { userId: "victim" } }),
    request.post("/api/check-in/verify-phone", { data: { userId: "victim", phone: "999999999" } }),
    request.get("/api/check-in/history"),
    request.get("/api/check-in/stream"),
    request.get("/api/stream"),
    request.get("/api/commands"),
    request.post("/api/biometric/capture", { data: {} }),
    request.post("/api/biometric/identify", { data: {} }),
    request.get("/api/biometric/status/victim"),
    request.get("/api/biometric/active-target"),
    request.post("/api/biometric/active-target", { data: { userId: "victim" } }),
    request.delete("/api/biometric/active-target"),
    request.get("/api/biometric/ping"),
    request.get("/api/products/gym"),
    request.post("/api/auth/verify-email", { data: { userId: "victim", email: "attacker@example.com" } }),
  ]);
  expect(responses.map(response => response.status())).toEqual(Array(15).fill(401));
});

test("legacy JWTs without a credential version cannot access protected data", async ({ request }) => {
  const secret = process.env.NEXTAUTH_SECRET;
  test.skip(!secret, "NEXTAUTH_SECRET is required to sign the legacy test token");
  const value = await encode({ secret: secret!, token: { id: "legacy-admin", role: "admin" } });
  const response = await request.get("/api/admin/me", { headers: { Cookie: "next-auth.session-token=" + value } });
  expect(response.status()).toBe(401);
  const session = await request.get("/api/auth/session", { headers: { Cookie: "next-auth.session-token=" + value } });
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
});
