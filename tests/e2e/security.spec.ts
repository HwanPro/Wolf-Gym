import { expect, test } from "@playwright/test";

test("protected pages redirect unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/admin/dashboard");
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
});
