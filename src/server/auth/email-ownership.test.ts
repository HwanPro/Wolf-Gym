import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { canUseEmailUsername } from "./email-ownership";

vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    emailVerification: { findUnique: vi.fn() },
  },
}));
beforeEach(() => vi.resetAllMocks());

it("allows regular usernames and retaining an existing email username", async () => {
  expect(await canUseEmailUsername("u", "cliente1")).toBe(true);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    username: "existing@example.com",
  } as never);
  expect(await canUseEmailUsername("u", "EXISTING@example.com")).toBe(true);
});

it("rejects an email that belongs to an unverified or different verification", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    username: "cliente1",
  } as never);
  for (const record of [
    null,
    { email: "new@example.com", verified: false },
    { email: "other@example.com", verified: true },
  ]) {
    vi.mocked(prisma.emailVerification.findUnique).mockResolvedValue(
      record as never,
    );
    expect(await canUseEmailUsername("u", "new@example.com")).toBe(false);
  }
});

it("accepts only the verified email of the account being modified", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    username: "cliente1",
  } as never);
  vi.mocked(prisma.emailVerification.findUnique).mockResolvedValue({
    email: "new@example.com",
    verified: true,
  } as never);
  expect(await canUseEmailUsername("u", "NEW@example.com")).toBe(true);
  expect(prisma.emailVerification.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: "u" } }),
  );
});
