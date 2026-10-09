import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mock = vi.hoisted(() => ({
  session: vi.fn(), findMany: vi.fn(), count: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mock.session }));
vi.mock("@/lib/auth-options", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({ PrismaClient: class {
  programTemplate = { findMany: mock.findMany, count: mock.count };
} }));
beforeEach(() => {
  vi.clearAllMocks(); mock.findMany.mockResolvedValue([]); mock.count.mockResolvedValue(0);
});
it.each(["", "?published=false", "?published=true"])("keeps client publication enforced for %s", async query => {
  mock.session.mockResolvedValue({ user: { id: "client", role: "client" } });
  expect((await GET(new NextRequest("http://localhost/api/programs" + query))).status).toBe(200);
  expect(mock.findMany.mock.calls[0][0].where.isPublished).toBe(true);
  expect(mock.count.mock.calls[0][0].where.isPublished).toBe(true);
});
it("allows the administrator to request drafts", async () => {
  mock.session.mockResolvedValue({ user: { role: "admin" } });
  await GET(new NextRequest("http://localhost/api/programs?published=false"));
  expect(mock.findMany.mock.calls[0][0].where.isPublished).toBe(false);
});
it("does not query programs without a session", async () => {
  mock.session.mockResolvedValue(null);
  expect((await GET(new NextRequest("http://localhost/api/programs"))).status).toBe(401);
  expect(mock.findMany).not.toHaveBeenCalled();
});
