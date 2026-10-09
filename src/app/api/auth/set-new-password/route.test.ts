import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import prisma from "@/infrastructure/prisma/prisma";
import { POST } from "./route";

const transaction = vi.hoisted(() => ({
  passwordResetToken: { updateMany: vi.fn() },
  user: { update: vi.fn() },
  session: { deleteMany: vi.fn() },
}));
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: {
  passwordResetToken: { findUnique: vi.fn() },
  $transaction: vi.fn(async callback => callback(transaction)),
} }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "new-password-hash") } }));

const token = "a".repeat(64);
const tokenHash = createHash("sha256").update(token).digest("hex");
const request = (newPassword = "Valid-password-1") => new Request("http://localhost/api/auth/set-new-password", {
  method: "POST", body: JSON.stringify({ token, newPassword }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
    id: "reset-1", userId: "owner", tokenHash, usedAt: null,
    expiresAt: new Date(Date.now() + 60000),
  } as never);
  transaction.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
});

it("claims a live token before changing its owner's password and sessions", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash }, include: { user: true } });
  expect(transaction.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "reset-1", tokenHash, usedAt: null, expiresAt: { gt: expect.any(Date) } },
  }));
  expect(transaction.user.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { password: "new-password-hash" } });
  expect(transaction.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner" } });
  expect(transaction.passwordResetToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(transaction.user.update.mock.invocationCallOrder[0]);
});
it("refuses a token claimed by a competing request without changing the password", async () => {
  transaction.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
  expect((await POST(request())).status).toBe(400);
  expect(transaction.user.update).not.toHaveBeenCalled();
  expect(transaction.session.deleteMany).not.toHaveBeenCalled();
});
it("rejects already used tokens before entering a transaction", async () => {
  vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({ usedAt: new Date() } as never);
  expect((await POST(request())).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("rejects passwords whose UTF-8 bytes would be truncated by bcrypt", async () => {
  expect((await POST(request("😀".repeat(19)))).status).toBe(400);
  expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
});
