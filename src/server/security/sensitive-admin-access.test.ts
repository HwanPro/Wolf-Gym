import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { requestToken } from "@/server/auth/authorization";

import {
  createSensitiveAdminToken,
  isValidSensitiveAdminToken,
  SENSITIVE_ADMIN_TTL_SECONDS,
  getSensitiveAdminAccess,
} from "./sensitive-admin-access";

vi.mock("@/server/auth/authorization", () => ({ requestToken: vi.fn() }));

describe("sensitive admin access", () => {
  const originalSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-sensitive-secret";
  });

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = originalSecret;
  });

  it("accepts a signed token for the same administrator", () => {
    const token = createSensitiveAdminToken("admin-1");
    expect(isValidSensitiveAdminToken(token, "admin-1")).toBe(true);
    expect(isValidSensitiveAdminToken(token, "admin-2")).toBe(false);
  });

  it("rejects tampering and expired tokens", () => {
    const token = createSensitiveAdminToken("admin-1");
    expect(isValidSensitiveAdminToken(`${token}x`, "admin-1")).toBe(false);

    const expired = createSensitiveAdminToken(
      "admin-1",
      Date.now() - (SENSITIVE_ADMIN_TTL_SECONDS + 1) * 1000,
    );
    expect(isValidSensitiveAdminToken(expired, "admin-1")).toBe(false);
  });

  it("rejects malformed tokens including trailing segments and signed invalid JSON", () => {
    for (const value of [undefined, "", ".", "a.b", "a".repeat(3000), createSensitiveAdminToken("admin-1") + ".extra"]) {
      expect(isValidSensitiveAdminToken(value, "admin-1")).toBe(false);
    }
    const payload = Buffer.from("invalid JSON").toString("base64url");
    const signature = createHmac("sha256", process.env.NEXTAUTH_SECRET!).update(payload).digest("base64url");
    expect(isValidSensitiveAdminToken(payload + "." + signature, "admin-1")).toBe(false);
  });

  it("requires a current admin session and a verified cookie for that administrator", async () => {
    const request = new NextRequest("http://localhost/api/admin/s3-images");
    vi.mocked(requestToken).mockResolvedValueOnce(null);
    expect(await getSensitiveAdminAccess(request)).toMatchObject({ authorized: false, status: 401 });
    vi.mocked(requestToken).mockResolvedValueOnce({ id: "client", role: "client" });
    expect(await getSensitiveAdminAccess(request)).toMatchObject({ authorized: false, status: 403 });
    vi.mocked(requestToken).mockResolvedValueOnce({ id: "", role: "admin" });
    expect(await getSensitiveAdminAccess(request)).toMatchObject({ authorized: false, status: 403 });
    vi.mocked(requestToken).mockResolvedValue({ id: "admin-1", role: "admin", credentialVersion: "v1" });
    expect(await getSensitiveAdminAccess(request)).toMatchObject({ authorized: false, status: 428 });
    const verified = new NextRequest(request.url, { headers: { Cookie: "wolf-sensitive-admin=" + createSensitiveAdminToken("admin-1", Date.now(), "v1") } });
    expect(await getSensitiveAdminAccess(verified)).toEqual({ authorized: true, userId: "admin-1" });
    vi.mocked(requestToken).mockResolvedValue({ id: "admin-1", role: "admin", credentialVersion: "v2" });
    expect(await getSensitiveAdminAccess(verified)).toMatchObject({ authorized: false, status: 428 });
  });
});
