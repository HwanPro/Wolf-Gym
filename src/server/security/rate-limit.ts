export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type WindowState = { count: number; expiresAt: number };

export class InMemoryRateLimitStore {
  private readonly windows = new Map<string, WindowState>();
  constructor(private readonly maxKeys = 10_000) {}

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitResult {
    if (!this.windows.has(key) && this.windows.size >= this.maxKeys) {
      this.removeExpired(now);
      if (this.windows.size >= this.maxKeys) {
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      }
    }
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

