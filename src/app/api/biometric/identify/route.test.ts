import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { POST } from "./route";

vi.mock("@/infrastructure/prisma/prisma", () => ({ default: {
  user: { findUnique: vi.fn() }, clientProfile: { findUnique: vi.fn() },
} }));
vi.mock("@/server/auth/authorization", () => ({ requireAdmin: vi.fn() }));
const service = vi.fn();
const request = (template: unknown = Buffer.from("test-template").toString("base64")) =>
  new NextRequest("http://localhost/api/biometric/identify", {
    method: "POST", body: JSON.stringify({ template }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", service);
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: true, token: { id: "admin", role: "admin" } });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "client-1", firstName: "Test", lastName: "Client", username: "client" } as never);
  vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown, status = 200) => service.mockResolvedValueOnce(NextResponse.json(body, { status }));

it("does not call the reader for an unauthorized request", async () => {
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: false, response: NextResponse.json({ message: "Forbidden" }, { status: 403 }) });
  expect((await POST(request())).status).toBe(403);
  expect(service).not.toHaveBeenCalled();
});
it("treats an explicit no-finger timeout as an empty reading, not a gateway failure", async () => {
  respond({ ok: true });
  respond({ ok: false, template: null, reason: "NO_FINGER" });
  const response = await POST(request(null));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, match: false, message: "No hay dedo en el lector" });
  expect(service).toHaveBeenCalledTimes(2);
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it("reports a database failure as unavailable, not as an unregistered fingerprint", async () => {
  respond({ ok: false, match: false, message: "The ConnectionString property has not been initialized. Password=private" });
  const response = await POST(request());
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, match: false, reason: "BIOMETRIC_UNAVAILABLE" });
  expect(JSON.stringify(body)).not.toContain("Password");
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it("preserves a genuine unsuccessful comparison", async () => {
  respond({ ok: true, match: false, message: "No match found" });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, match: false });
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it("requires another reading for an ambiguous comparison", async () => {
  respond({ ok: false, match: false, message: "Ambiguous match detected" });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, reason: "AMBIGUOUS_MATCH" });
});
it("rejects an invalid service payload", async () => {
  respond({ ok: true });
  expect((await POST(request())).status).toBe(502);
});
it("rejects a match with no owner", async () => {
  respond({ ok: true, match: true });
  expect((await POST(request())).status).toBe(502);
});
it("reports incompatible database identities", async () => {
  respond({ ok: true, match: true, userId: "missing-user" });
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, reason: "DATABASE_MISMATCH" });
});
it("returns the matched owner even when there is no membership profile", async () => {
  respond({ ok: true, match: true, userId: "client-1" });
  expect(await (await POST(request())).json()).toMatchObject({ ok: true, match: true, userId: "client-1", hasProfile: false });
});
it("reports an HTTP service failure without disclosing its details", async () => {
  respond({ message: "internal details" }, 500);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("internal details");
});
it("reports an unreachable service as unavailable", async () => {
  service.mockRejectedValueOnce(new Error("connection refused"));
  expect((await POST(request())).status).toBe(503);
});
it.each(["invalid!", 123, Buffer.alloc(2049).toString("base64")])("rejects malformed or oversized input before calling native code (%#)", async template => {
  expect((await POST(request(template))).status).toBe(400);
  expect(service).not.toHaveBeenCalled();
});
