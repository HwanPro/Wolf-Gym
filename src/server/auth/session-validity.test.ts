import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { credentialVersion, validateSessionToken } from "./session-validity";

vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: { user: { findUnique: vi.fn() } },
}));
const findUser = vi.mocked(prisma.user.findUnique);
const user = { password: "hashed-password", twoFASecret: null, role: "admin" };
const token = () => ({
  id: "admin-1",
  role: "admin",
  credentialVersion: credentialVersion(user),
});

describe("session revocation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects missing sessions and JWTs issued before credential versioning", async () => {
    expect(await validateSessionToken(null)).toBeNull();
    expect(
      await validateSessionToken({ id: "admin-1", role: "admin" }),
    ).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it("accepts a signed session only while its credentials still match", async () => {
    findUser.mockResolvedValue(user as never);
    expect(await validateSessionToken(token())).toMatchObject({
      id: "admin-1",
      role: "admin",
    });
  });

  it.each([
    { ...user, password: "new-password-hash" },
    { ...user, twoFASecret: "new-2fa-secret" },
    { ...user, role: "client" },
    { ...user, securityVersion: 2 },
    null,
  ])(
    "rejects sessions after password, 2FA, role changes or account deletion: %j",
    async (changed) => {
      findUser.mockResolvedValue(changed as never);
      expect(await validateSessionToken(token())).toBeNull();
    },
  );

  it("does not include credentials in the session version", () => {
    expect(credentialVersion(user)).toMatch(/^[a-f0-9]{64}$/);
    expect(credentialVersion(user)).not.toContain(user.password);
  });
});
