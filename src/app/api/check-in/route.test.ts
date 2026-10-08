import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { requireAdmin } from "@/server/auth/authorization";
import { broadcastToRoom } from "@/lib/stream-manager";
import { POST } from "./route";

const transaction = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  clientProfile: { findUnique: vi.fn() },
  attendance: {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@/infrastructure/prisma/prisma", () => ({
  default: {
    $transaction: vi.fn(async (callback) => callback(transaction)),
    user: { findUnique: vi.fn() },
    clientProfile: { findUnique: vi.fn() },
    dailyDebt: { aggregate: vi.fn() },
  },
}));
vi.mock("@/server/auth/authorization", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/attendanceAutoClose", () => ({
  autoCloseExpiredAttendances: vi.fn(),
}));
vi.mock("@/lib/stream-manager", () => ({ broadcastToRoom: vi.fn() }));

const request = (intent = "checkin") =>
  new NextRequest("http://localhost/api/check-in", {
    method: "POST",
    body: JSON.stringify({ userId: "client-1", intent }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T15:00:00Z"));
  vi.mocked(requireAdmin).mockResolvedValue({
    authorized: true,
    token: { id: "admin", role: "admin" },
  });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "client-1",
    firstName: "Prueba",
  } as never);
  vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({
    profile_end_date: new Date("2026-10-24T00:00:00Z"),
    debt: 0,
  } as never);
  transaction.clientProfile.findUnique.mockResolvedValue({
    profile_end_date: new Date("2026-10-24T00:00:00Z"),
    debt: 0,
  });
  transaction.attendance.findFirst.mockReset().mockResolvedValue(null);
  transaction.attendance.count.mockResolvedValue(0);
  transaction.attendance.create.mockResolvedValue({ id: "attendance-1" });
  transaction.attendance.update.mockResolvedValue({
    id: "attendance-1",
    durationMins: 90,
  });
});
afterEach(() => vi.useRealTimers());

it("locks the user inside the transaction before checking and creating attendance", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(transaction.$queryRaw.mock.calls[0][1]).toBe("client-1");
  expect(transaction.$queryRaw.mock.calls[0][0].join("?")).toContain(
    "pg_advisory_xact_lock(hashtext(?))",
  );
  expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    transaction.attendance.findFirst.mock.invocationCallOrder[0],
  );
  expect(transaction.attendance.create).toHaveBeenCalledTimes(1);
  expect(broadcastToRoom).toHaveBeenCalledTimes(1);
});
it("does not create or broadcast a second entry during rebound", async () => {
  transaction.attendance.findFirst.mockResolvedValueOnce({
    id: "existing",
    checkOutTime: null,
  });
  const response = await POST(request());
  expect(await response.json()).toMatchObject({ ok: true, type: "rebote" });
  expect(transaction.attendance.create).not.toHaveBeenCalled();
  expect(broadcastToRoom).not.toHaveBeenCalled();
});
it("refuses a third entry without changing records", async () => {
  transaction.attendance.count.mockResolvedValue(2);
  expect(await (await POST(request())).json()).toMatchObject({
    ok: false,
    reason: "limit_reached",
  });
  expect(transaction.attendance.create).not.toHaveBeenCalled();
});
it("closes an open record and calculates the duration", async () => {
  transaction.attendance.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      id: "attendance-1",
      checkInTime: new Date("2026-10-02T13:30:00Z"),
    });
  expect(await (await POST(request("checkout"))).json()).toMatchObject({
    ok: true,
    action: "checkout",
  });
  expect(transaction.attendance.update).toHaveBeenCalledWith({
    where: { id: "attendance-1" },
    data: { checkOutTime: new Date("2026-10-02T15:00:00Z"), durationMins: 90 },
  });
});
it("rejects anonymous actions before touching attendance", async () => {
  vi.mocked(requireAdmin).mockResolvedValue({
    authorized: false,
    response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
  });
  expect((await POST(request())).status).toBe(401);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it.each([null, { profile_end_date: null, debt: 0 }])("requires a membership before creating attendance: %s", async (profile) => {
  transaction.clientProfile.findUnique.mockResolvedValue(profile);
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, reason: "membership_required" });
  expect(transaction.attendance.create).not.toHaveBeenCalled();
  expect(broadcastToRoom).not.toHaveBeenCalled();
});

it("allows checkout even when the membership date is absent", async () => {
  transaction.clientProfile.findUnique.mockResolvedValue({ profile_end_date: null, debt: 0 });
  transaction.attendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
    id: "attendance-1", checkInTime: new Date("2026-10-02T13:30:00Z"),
  });
  expect((await POST(request("checkout"))).status).toBe(200);
  expect(transaction.attendance.update).toHaveBeenCalledTimes(1);
  expect(transaction.attendance.create).not.toHaveBeenCalled();
});
