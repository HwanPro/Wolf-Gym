import { createHash } from "node:crypto";
import prisma from "@/infrastructure/prisma/prisma";
import type { RateLimitResult } from "./rate-limit";

const denied = (): RateLimitResult => ({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
const MAX_ACTIVE_KEYS = 10_000;

// All app processes sharing a database use the same bounded counter store.
// The transaction lock also prevents concurrent new keys exceeding its cap.
export class PersistentRateLimitStore {
  constructor(private readonly scope: string) {}

  private digest(key: string) {
    return createHash("sha256").update(this.scope + "\0" + key).digest("hex");
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!key || key.length > 1024 || !Number.isInteger(limit) || limit < 1 || limit > 1000 ||
        !Number.isInteger(windowMs) || windowMs < 1 || windowMs > 86_400_000) return denied();
    const digest = this.digest(key);
    try {
      return await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1464288594, 1)`;
        await tx.$executeRaw`DELETE FROM "security_rate_limit_window" WHERE "expires_at" <= CURRENT_TIMESTAMP`;
        const existing = await tx.$queryRaw<Array<{ attempts: number; retry: number }>>`
          SELECT "attempts", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expires_at" - CURRENT_TIMESTAMP))))::int AS retry
          FROM "security_rate_limit_window" WHERE "key_hash" = ${digest}`;
        if (existing[0]?.attempts >= limit) {
          return { allowed: false, remaining: 0, retryAfterSeconds: existing[0].retry };
        }
        if (!existing.length) {
          const capacity = await tx.$queryRaw<Array<{ count: number }>>`
            SELECT count(*)::int AS count FROM "security_rate_limit_window"`;
          if (capacity[0].count >= MAX_ACTIVE_KEYS) return denied();
        }
        const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
          INSERT INTO "security_rate_limit_window" ("key_hash", "attempts", "expires_at")
          VALUES (${digest}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
          ON CONFLICT ("key_hash") DO UPDATE
          SET "attempts" = "security_rate_limit_window"."attempts" + 1
          RETURNING "attempts"`;
        return { allowed: true, remaining: Math.max(0, limit - rows[0].attempts), retryAfterSeconds: 0 };
      }, { maxWait: 2000, timeout: 5000 });
    } catch {
      // A missing migration, unavailable DB or contention must never bypass the limit.
      // Database errors can contain credentials or identifiers; do not log them here.
      return denied();
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await prisma.$executeRaw`DELETE FROM "security_rate_limit_window" WHERE "key_hash" = ${this.digest(key)}`;
    } catch {
      // Preserve the counter on failure; do not fall back to an empty memory store.
    }
  }
}

export const loginRateLimit = new PersistentRateLimitStore("login");
