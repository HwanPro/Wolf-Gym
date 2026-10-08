import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/server/security/persistent-rate-limit", () => ({
  PersistentRateLimitStore: class {
    async consume() { return { allowed: true, remaining: 2, retryAfterSeconds: 0 }; }
  },
}));
const mocks = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  emailVerification: { findFirst: vi.fn(), findUnique: vi.fn() },
  passwordResetToken: { upsert: vi.fn() }, send: vi.fn(),
}));
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: mocks }));
vi.mock("@/lib/mail", () => ({ getAppBaseUrl: () => "http://localhost:3400", sendPasswordResetEmail: mocks.send }));
import { POST } from "./route";
let sequence = 0;
const request = (identifier = `recovery-${sequence++}`) => new Request("http://localhost/api/auth/reset-password", { method: "POST", body: JSON.stringify({ identifier }) });
const user = { id: "recovery-owner", username: "verified@example.invalid", firstName: "Prueba", lastName: "Local" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.findFirst.mockResolvedValue(null);
  mocks.emailVerification.findUnique.mockResolvedValue({ verified: true, email: "owner@example.invalid" });
});
it("uses the same conditional public response for absent accounts and delivery failure, without logging SMTP secrets", async () => {
  const absent = await POST(request());
  mocks.user.findFirst.mockResolvedValue(user);
  mocks.send.mockRejectedValue(new Error("password=private-fixture; Authorization=private-fixture"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = await POST(request());
  expect(failed.status).toBe(absent.status);
  expect(await failed.json()).toEqual(await absent.json());
  expect(JSON.stringify([...warning.mock.calls, ...error.mock.calls])).not.toContain("private-fixture");
  expect(mocks.send).toHaveBeenCalledWith("owner@example.invalid", expect.any(String), expect.stringContaining("token="));
  warning.mockRestore(); error.mockRestore();
});
it("never treats an email-shaped username as a verified destination", async () => {
  mocks.user.findFirst.mockResolvedValue(user);
  mocks.emailVerification.findUnique.mockResolvedValue({ verified: false, email: "unverified@example.invalid" });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.passwordResetToken.upsert).not.toHaveBeenCalled();
});
it("creates a hashed one-hour token and sends only to the verified owner", async () => {
  mocks.user.findFirst.mockResolvedValue(user);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.passwordResetToken.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({userId:user.id,tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/),expiresAt:expect.any(Date)})}));
  const data = mocks.passwordResetToken.upsert.mock.calls[0][0].create;
  expect(data.expiresAt.getTime()-Date.now()).toBeGreaterThan(3590000);
  expect(mocks.send).toHaveBeenCalledWith("owner@example.invalid", "Prueba Local", expect.stringMatching(/^http:\/\/localhost:3400\/auth\/reset-password\?token=[a-f0-9]{64}$/));
});
