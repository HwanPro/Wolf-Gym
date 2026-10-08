import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { authOptions } from "./auth-options";

vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: { clientProfile: { findUnique: vi.fn(), create: vi.fn() } },
}));

beforeEach(() => vi.clearAllMocks());

const signIn = (role = "client") =>
  authOptions.callbacks!.signIn!({
    user: { id: "new-client", role, phoneNumber: "990000001" },
    account: null,
  });

it("creates a missing client profile without granting a membership", async () => {
  vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue(null);
  expect(await signIn()).toBe(true);
  expect(prisma.clientProfile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      user_id: "new-client",
      profile_plan: "Sin plan",
      profile_start_date: null,
      profile_end_date: null,
    }),
  });
});

it("preserves the membership of an existing profile", async () => {
  vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({
    profile_id: "existing",
  } as never);
  expect(await signIn()).toBe(true);
  expect(prisma.clientProfile.create).not.toHaveBeenCalled();
});

it("does not create client profiles for an administrator", async () => {
  expect(await signIn("admin")).toBe(true);
  expect(prisma.clientProfile.findUnique).not.toHaveBeenCalled();
  expect(prisma.clientProfile.create).not.toHaveBeenCalled();
});
