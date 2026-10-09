import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST as indexed } from "./[id]/exercises/[wid]/sets/route";
import { POST as sequential } from "./exercises/[id]/sets/route";
const mock = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mock.session }));
vi.mock("@/lib/auth-options", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({ PrismaClient: class {
  workoutExercise = { findUnique: mock.findUnique };
} }));
vi.mock("@/infrastructure/prisma/prisma", () => ({default: {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({$executeRaw: vi.fn(), workoutExercise: {findUnique: mock.findUnique}}),
}}));
beforeEach(() => {
  vi.clearAllMocks(); mock.session.mockResolvedValue({ user: { id: "client" } });
  mock.findUnique.mockResolvedValue(null);
});
it.each([{ reps: 1.5 }, { reps: -1 }, { restSec: 0.5 }, { weight: -1 }])("rejects invalid sets at both route boundaries", async override => {
  const makeRequest = () => new NextRequest("http://localhost/api/workouts/sets", { method: "POST", body: JSON.stringify({ setIndex: 1, weight: 10.5, reps: 10, ...override }) });
  expect((await indexed(makeRequest(), { params: Promise.resolve({ id: "workout", wid: "exercise" }) })).status).toBe(400);
  expect((await sequential(makeRequest(), { params: Promise.resolve({ id: "exercise" }) })).status).toBe(400);
  expect(mock.findUnique).not.toHaveBeenCalled();
});
it("allows zero and fractional weight for integer repetitions to reach ownership validation", async () => {
  for (const weight of [0, 10.5]) {
    const request = new NextRequest("http://localhost/api/workouts/sets", { method: "POST", body: JSON.stringify({ setIndex: 1, weight, reps: 10, isWarmup: true }) });
    expect((await indexed(request, { params: Promise.resolve({ id: "workout", wid: "exercise" }) })).status).toBe(404);
  }
  expect(mock.findUnique).toHaveBeenCalledTimes(2);
});
