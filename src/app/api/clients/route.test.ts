import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { requestToken, requireAdmin } from "@/server/auth/authorization";
import { POST } from "./route";
import { PUT } from "./[id]/route";
import prisma from "@/infrastructure/prisma/prisma";
vi.mock("@/server/auth/authorization", () => ({ requestToken: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: { clientProfile: { findUnique: vi.fn() }, user: { findFirst: vi.fn(), findUnique: vi.fn() } } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestToken).mockResolvedValue({ id: "admin", role: "admin" });
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: true, token: { id: "admin", role: "admin" } });
});
const request = (data: unknown) => new NextRequest("http://localhost/api/clients", { method: "POST", body: JSON.stringify(data) });
it.each([
  { startDate: "2026-02-30" }, { startDate: "2026-12-01", endDate: "2026-11-01" }, { plan: "" }, { debt: -1 },
])("rejects invalid membership input before creating a client", async profile => {
  const response = await POST(request({ username: "test-client", firstName: "Test", lastName: "Client", phoneNumber: "987654321", profile: { plan: "Plan Mes", startDate: "2026-10-01", endDate: "2026-11-01", ...profile } }));
  expect(response.status).toBe(400);
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it.each([
  { startDate: "2026-02-30" }, { startDate: "2026-12-01", endDate: "2026-11-01" }, { plan: "" },
])("rejects invalid edited membership dates and plan before DB access", async override => {
  const response = await PUT(request({ firstName: "Test", lastName: "Client", plan: "Plan Mes", startDate: "2026-10-01", endDate: "2026-11-01", ...override }), { params: Promise.resolve({ id: "client-profile" }) });
  expect(response.status).toBe(400);
  expect(prisma.clientProfile.findUnique).not.toHaveBeenCalled();
});
