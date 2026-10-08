import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import speakeasy from "speakeasy";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { POST, PUT } from "./route";
vi.mock("@/server/security/persistent-rate-limit", () => ({
  PersistentRateLimitStore: class {
    async consume() { return { allowed: true, remaining: 2, retryAfterSeconds: 0 }; }
  },
}));

vi.mock("@/server/auth/authorization", () => ({ authorizeRequest: vi.fn() }));
vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: { user: { findUnique: vi.fn(), updateMany: vi.fn() } },
}));

const secret = "JBSWY3DPEHPK3PXP";
const request = (challenge?: string, sentSecret = secret) =>
  new NextRequest("http://localhost/api/auth/2FA", {
    method: "PUT",
    headers: challenge ? { Cookie: "wolf-2fa-enrollment=" + challenge } : {},
    body: JSON.stringify({ secret: sentSecret, token: "123456" }),
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.updateMany).mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", "2fa-test-secret");
  vi.mocked(authorizeRequest).mockResolvedValue({
    authorized: true,
    token: { id: "owner", credentialVersion: "version-1" },
  });
});

it("does not allow a browser-provided secret without a server enrollment", async () => {
  expect((await PUT(request())).status).toBe(400);
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});

it("rejects enrollment issued for another account or a different secret", async () => {
  const challenge = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      id: "victim",
      enrollmentSecret: secret,
      credentialVersion: "version-1",
    },
  });
  expect((await PUT(request(challenge))).status).toBe(400);
  const ownChallenge = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      id: "owner",
      enrollmentSecret: secret,
      credentialVersion: "version-1",
    },
  });
  expect((await PUT(request(ownChallenge, "AAAAAAAAAAAAAAAA"))).status).toBe(
    400,
  );
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});

it("prevents replacing an already enabled second factor", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "owner",
    twoFASecret: secret,
  } as never);
  expect((await POST(request())).status).toBe(409);
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});

it("enables only the proven enrollment with a valid TOTP", async () => {
  const challenge = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      id: "owner",
      enrollmentSecret: secret,
      credentialVersion: "version-1",
    },
  });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "owner",
    twoFASecret: null,
  } as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
  vi.spyOn(speakeasy.totp, "verify").mockReturnValue(true);
  const response = await PUT(request(challenge));
  expect(response.status).toBe(200);
  expect(prisma.user.updateMany).toHaveBeenCalledWith({
    where: { id: "owner", twoFASecret: null },
    data: { twoFASecret: secret },
  });
  expect(response.cookies.get("wolf-2fa-enrollment")?.value).toBe("");
});
