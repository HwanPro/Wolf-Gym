import { describe, expect, it } from "vitest";

import { InMemoryRateLimitStore } from "./rate-limit";

describe("rate limit store", () => {
  it("allows requests up to the limit and reports a retry delay", () => {
    const store = new InMemoryRateLimitStore();
    const start = 1_000;
    expect(store.consume("login:user", 2, 60_000, start).allowed).toBe(true);
    expect(store.consume("login:user", 2, 60_000, start + 1).allowed).toBe(true);
    expect(store.consume("login:user", 2, 60_000, start + 2)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("isolates keys and resets expired windows", () => {
    const store = new InMemoryRateLimitStore();
    store.consume("a", 1, 1_000, 0);
    expect(store.consume("b", 1, 1_000, 1).allowed).toBe(true);
    expect(store.consume("a", 1, 1_000, 1_001).allowed).toBe(true);
    store.reset("a");
    expect(store.consume("a", 1, 1_000, 1_002).allowed).toBe(true);
  });
});
