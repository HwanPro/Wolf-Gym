import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requireAdmin } from "@/server/auth/authorization";
import { POST } from "./route";
vi.mock("@/server/auth/authorization", () => ({ requireAdmin: vi.fn() }));
const service = vi.fn();
const template = Buffer.from("synthetic regression sample").toString("base64");
const context = { params: Promise.resolve({ id: "temporary-client-id" }) };
const request = (data: unknown = { templates: [template, template, template] }) => new NextRequest("http://localhost/api/biometric/register/temporary-client-id", { method: "POST", body: JSON.stringify(data) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", service);
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: true, token: { id: "admin", role: "admin" } });
});
afterEach(() => vi.unstubAllGlobals());
it("preserves the duplicate conflict with an actionable message", async () => {
  service.mockResolvedValueOnce(NextResponse.json({ ok: false, message: "FINGERPRINT_ALREADY_REGISTERED" }, { status: 409 }));
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, reason: "FINGERPRINT_ALREADY_REGISTERED", message: expect.stringContaining("otro cliente") });
});
it.each([
  [400, "SAMPLES_DO_NOT_MATCH"],
  [200, "Please press the same finger 3 times for the enrollment"],
])("explains mixed samples for service status %s", async (status, message) => {
  service.mockResolvedValueOnce(NextResponse.json({ ok: false, message }, { status }));
  const response = await POST(request(), context);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    ok: false,
    reason: "SAMPLES_DO_NOT_MATCH",
    message: expect.stringContaining("mismo dedo"),
  });
});
it.each([{ ok: false, message: "internal details" }, {}, { message: "no ok flag" }])("never reports incomplete or failed service enrollment as successful", async data => {
  service.mockResolvedValueOnce(NextResponse.json(data));
  const response = await POST(request(), context);
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("internal details");
});
it.each([
  { templates: ["invalid!", template, template] },
  { templates: [Buffer.alloc(2049).toString("base64"), template, template] },
  { templates: [template, template, template], fingerIndex: 0.5 },
])("rejects invalid samples and finger indexes before native calls", async data => {
  expect((await POST(request(data), context)).status).toBe(400);
  expect(service).not.toHaveBeenCalled();
});
it("accepts an explicit successful service result", async () => {
  service.mockResolvedValueOnce(NextResponse.json({ ok: true }));
  expect((await POST(request(), context)).status).toBe(200);
});
