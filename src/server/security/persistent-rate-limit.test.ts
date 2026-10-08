import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { PersistentRateLimitStore } from "./persistent-rate-limit";

vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: { $transaction: vi.fn(), $executeRaw: vi.fn() },
}));

beforeEach(() => vi.resetAllMocks());

it("rejects attempts when the shared database fails instead of using a fresh memory counter", async () => {
  vi.mocked(prisma.$transaction).mockRejectedValue(new Error("private-connection-fixture"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await new PersistentRateLimitStore("login").consume("owner", 8, 900000)).toEqual({
    allowed: false, remaining: 0, retryAfterSeconds: 60,
  });
  expect(log).not.toHaveBeenCalled();
});

it.each([
  ["", 8, 1000], ["x".repeat(1025), 8, 1000], ["x", 0, 1000],
  ["x", 1.5, 1000], ["x", 8, -1], ["x", 8, 86400001],
])("rejects invalid boundaries before acquiring a database connection", async (key, limit, windowMs) => {
  expect((await new PersistentRateLimitStore("login").consume(String(key), Number(limit), Number(windowMs))).allowed).toBe(false);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("does not clear or replace counters when a successful-login reset cannot reach the database", async () => {
  vi.mocked(prisma.$executeRaw).mockRejectedValue(new Error("unavailable"));
  await expect(new PersistentRateLimitStore("login").reset("owner")).resolves.toBeUndefined();
});
