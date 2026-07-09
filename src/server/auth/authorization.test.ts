import { describe, expect, it } from "vitest";

import { canAccess, safeRedirectForRole } from "./authorization";

describe("authorization policy", () => {
  it("denies unauthenticated and cross-role access", () => {
    expect(canAccess(null, ["admin"])).toBe(false);
    expect(canAccess({ role: "client" }, ["admin"])).toBe(false);
    expect(canAccess({ role: "admin" }, ["admin"])).toBe(true);
  });

  it("only emits application-owned role redirects", () => {
    expect(safeRedirectForRole("admin")).toBe("/admin/dashboard");
    expect(safeRedirectForRole("client")).toBe("/client/dashboard");
    expect(safeRedirectForRole("unexpected")).toBe("/auth/login");
  });
});
