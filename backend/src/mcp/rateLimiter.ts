import postgres from "postgres";

export interface RateLimitResult {
  allowed: boolean;
  tokens: number;
}

export interface RateLimiter {
  checkRateLimit(key: string, type: "mcp" | "chat" | "scan"): Promise<RateLimitResult>;
}

export class PostgresRateLimiter implements RateLimiter {
  private sql: postgres.Sql;
  private limits = {
    mcp: { maxTokens: 60, refillRate: 1.0 },
    chat: { maxTokens: 10, refillRate: 10 / 60 },
    scan: { maxTokens: 5, refillRate: 5 / 60 }
  };

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set.");
    }
    this.sql = postgres(connectionString, {
      ssl: { rejectUnauthorized: false },
      max: 1
    });
  }

  async checkRateLimit(key: string, type: "mcp" | "chat" | "scan"): Promise<RateLimitResult> {
    const limit = this.limits[type];
    if (!limit) {
      throw new Error(`Invalid rate limit type: ${type}`);
    }

    const { maxTokens, refillRate } = limit;
    const now = new Date();

    const result = await this.sql.begin(async (tx) => {
      // 1. Ensure the row exists
      await tx`
        INSERT INTO rate_limits (key, tokens, last_refilled_at)
        VALUES (${key}, ${maxTokens}, ${now})
        ON CONFLICT (key) DO NOTHING
      `;

      // 2. Lock and retrieve the current state
      const rows = await tx<{ tokens: number; last_refilled_at: Date }[]>`
        SELECT tokens, last_refilled_at
        FROM rate_limits
        WHERE key = ${key}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        return { allowed: true, tokens: maxTokens };
      }

      const dbTokens = Number(rows[0].tokens);
      const dbLastRefilled = new Date(rows[0].last_refilled_at);

      // 3. Calculate new token count
      const elapsedSeconds = Math.max(0, (now.getTime() - dbLastRefilled.getTime()) / 1000);
      const refilled = elapsedSeconds * refillRate;
      let newTokens = Math.min(maxTokens, dbTokens + refilled);

      let allowed = false;
      if (newTokens >= 1.0) {
        newTokens -= 1.0;
        allowed = true;
      }

      // 4. Update state
      await tx`
        UPDATE rate_limits
        SET tokens = ${newTokens}, last_refilled_at = ${now}
        WHERE key = ${key}
      `;

      return { allowed, tokens: newTokens };
    });

    return result;
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private limits = {
    mcp: { maxTokens: 60, refillRate: 1.0 },
    chat: { maxTokens: 10, refillRate: 10 / 60 },
    scan: { maxTokens: 5, refillRate: 5 / 60 }
  };

  private buckets = new Map<string, { tokens: number; lastRefilledAt: Date }>();

  async checkRateLimit(key: string, type: "mcp" | "chat" | "scan"): Promise<RateLimitResult> {
    const limit = this.limits[type];
    if (!limit) {
      throw new Error(`Invalid rate limit type: ${type}`);
    }

    const { maxTokens, refillRate } = limit;
    const now = new Date();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefilledAt: now };
      this.buckets.set(key, bucket);
    }

    const elapsedSeconds = Math.max(0, (now.getTime() - bucket.lastRefilledAt.getTime()) / 1000);
    const refilled = elapsedSeconds * refillRate;
    let newTokens = Math.min(maxTokens, bucket.tokens + refilled);

    let allowed = false;
    if (newTokens >= 1.0) {
      newTokens -= 1.0;
      allowed = true;
    }

    bucket.tokens = newTokens;
    bucket.lastRefilledAt = now;

    return { allowed, tokens: newTokens };
  }

  // Helper for tests to clear state
  clear() {
    this.buckets.clear();
  }
}

let rateLimiterInstance: RateLimiter | null = null;
export function getRateLimiter(): RateLimiter {
  if (rateLimiterInstance) return rateLimiterInstance;
  if (process.env.NODE_ENV === "test") {
    rateLimiterInstance = new MemoryRateLimiter();
  } else {
    rateLimiterInstance = new PostgresRateLimiter();
  }
  return rateLimiterInstance;
}
