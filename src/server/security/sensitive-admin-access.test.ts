import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSensitiveAdminToken,
  isValidSensitiveAdminToken,
  SENSITIVE_ADMIN_TTL_SECONDS,
} from "./sensitive-admin-access";

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
});
