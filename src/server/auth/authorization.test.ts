import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeRequest,
  canAccess,
  requestToken,
  requireAdmin,
  safeRedirectForRole,
} from "./authorization";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));

const mockedGetToken = vi.mocked(getToken);

describe("authorization policy", () => {
  beforeEach(() => mockedGetToken.mockReset());

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

  it("reads the signed request token with the configured secret", async () => {
    mockedGetToken.mockResolvedValue({ role: "admin", sub: "admin-1" });
    const request = new NextRequest("http://localhost/api/admin");

    await expect(requestToken(request)).resolves.toMatchObject({ role: "admin" });
    expect(mockedGetToken).toHaveBeenCalledWith({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
  });

  it("returns 401, 403 and an authorized token at the HTTP boundary", async () => {
    const request = new NextRequest("http://localhost/api/admin");

    mockedGetToken.mockResolvedValueOnce(null);
    const unauthenticated = await authorizeRequest(request, ["admin"]);
    expect(unauthenticated.authorized).toBe(false);
    if (!unauthenticated.authorized) {
      expect(unauthenticated.response.status).toBe(401);
    }

    mockedGetToken.mockResolvedValueOnce({ role: "client", sub: "client-1" });
    const forbidden = await authorizeRequest(request, ["admin"]);
    expect(forbidden.authorized).toBe(false);
    if (!forbidden.authorized) expect(forbidden.response.status).toBe(403);

    mockedGetToken.mockResolvedValueOnce({ role: "admin", sub: "admin-1" });
    const authorized = await requireAdmin(request);
    expect(authorized).toMatchObject({ authorized: true });
  });
});
