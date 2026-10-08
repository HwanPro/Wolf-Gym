import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { authorizeRequest } from "@/server/auth/authorization";
import { POST, PUT } from "./route";
vi.mock("@/server/security/persistent-rate-limit", async () => {
  const { InMemoryRateLimitStore } = await import("@/server/security/rate-limit");
  return { PersistentRateLimitStore: class {
    private store = new InMemoryRateLimitStore();
    async consume(key: string, limit: number, windowMs: number) {
      return this.store.consume(key, limit, windowMs);
    }
  } };
});

vi.mock("@/server/auth/authorization", () => ({ authorizeRequest: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
}));
vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    emailVerification: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const token = "a".repeat(64);
const record = {
  id: "verification-1",
  userId: "owner-1",
  email: "owner@example.com",
  token,
  code: "123456",
};
const request = (data: unknown) =>
  new NextRequest("http://localhost/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(data),
  });

describe("email verification security", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authorizeRequest).mockResolvedValue({
      authorized: true,
      token: { id: "owner-1", role: "client" },
    });
    vi.mocked(prisma.$transaction).mockImplementation((async (callback) =>
      callback(prisma)) as never);
  });

  it("rejects unauthenticated sending and attempts to change another account", async () => {
    vi.mocked(authorizeRequest).mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 401 }) as never,
    });
    expect(
      (await POST(request({ email: "other@example.com", userId: "victim" })))
        .status,
    ).toBe(401);
    expect(
      (await POST(request({ email: "other@example.com", userId: "victim" })))
        .status,
    ).toBe(403);
    expect(prisma.emailVerification.upsert).not.toHaveBeenCalled();
  });

  it("looks up the exact token, never trusts a supplied userId", async () => {
    vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(null);
    expect(
      (await PUT(request({ token: "b".repeat(64), userId: "victim" }))).status,
    ).toBe(400);
    expect(prisma.emailVerification.findFirst).toHaveBeenCalledWith({
      where: {
        token: "b".repeat(64),
        verified: false,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("accepts token-only links and updates only the proven account", async () => {
    vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(
      record as never,
    );
    vi.mocked(prisma.emailVerification.updateMany).mockResolvedValue({
      count: 1,
    });
    expect((await PUT(request({ token }))).status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { username: "owner@example.com" },
    });
    expect(prisma.emailVerification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token,
          code: "123456",
          verified: false,
        }),
      }),
    );
  });

  it("rejects token reuse, including simultaneous requests", async () => {
    vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(
      record as never,
    );
    vi.mocked(prisma.emailVerification.updateMany).mockResolvedValue({
      count: 0,
    });
    expect((await PUT(request({ token }))).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("ties codes to the session owner and rejects cross-account confirmation", async () => {
    expect(
      (await PUT(request({ code: "123456", userId: "victim" }))).status,
    ).toBe(403);
    expect(prisma.emailVerification.findFirst).not.toHaveBeenCalled();
    vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(null);
    expect((await PUT(request({ code: "999999" }))).status).toBe(400);
    expect(prisma.emailVerification.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "owner-1",
        code: "999999",
        verified: false,
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });

  it.each([
    { token: "anything" },
    { code: "123" },
    { code: "123456", token },
    {},
    null,
  ])("rejects malformed verification input: %j", async (data) => {
    expect((await PUT(request(data))).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("limits incorrect code guesses per account", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue({
      authorized: true,
      token: { id: "rate-limit-owner", role: "client" },
    });
    vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(null);
    for (let i = 0; i < 8; i++)
      expect((await PUT(request({ code: "999999" }))).status).toBe(400);
    const response = await PUT(request({ code: "999999" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(prisma.emailVerification.findFirst).toHaveBeenCalledTimes(8);
  });
});
