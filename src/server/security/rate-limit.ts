export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type WindowState = { count: number; expiresAt: number };

export class InMemoryRateLimitStore {
  private readonly windows = new Map<string, WindowState>();

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitResult {
    const current = this.windows.get(key);
    const state =
      !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + windowMs }
        : current;

    if (state.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((state.expiresAt - now) / 1_000),
        ),
      };
    }

    state.count += 1;
    this.windows.set(key, state);
    if (this.windows.size > 10_000) this.removeExpired(now);

    return {
      allowed: true,
      remaining: Math.max(0, limit - state.count),
      retryAfterSeconds: 0,
    };
  }

  reset(key: string) {
    this.windows.delete(key);
  }

  private removeExpired(now: number) {
    for (const [key, state] of this.windows) {
      if (state.expiresAt <= now) this.windows.delete(key);
    }
  }
}

export const loginRateLimit = new InMemoryRateLimitStore();
