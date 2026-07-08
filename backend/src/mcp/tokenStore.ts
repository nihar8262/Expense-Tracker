import postgres from "postgres";
import crypto from "node:crypto";

export interface TokenRecord {
  id: string;
  user_id: string;
  label: string;
  token_prefix: string;
  token_suffix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface TokenStore {
  createToken(userId: string, label: string): Promise<{ id: string; label: string; token: string; created_at: Date }>;
  listTokens(userId: string): Promise<TokenRecord[]>;
  revokeToken(userId: string, tokenId: string): Promise<boolean>;
  deleteToken(userId: string, tokenId: string): Promise<boolean>;
  authenticateToken(token: string): Promise<string | null>;
}

export class PostgresTokenStore implements TokenStore {
  private sql: postgres.Sql;

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

  async createToken(userId: string, label: string) {
    const rawRandom = crypto.randomBytes(32).toString("base64url");
    const token = `mcp_${rawRandom}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokenPrefix = token.slice(0, 8);
    const tokenSuffix = token.slice(-4);
    const id = crypto.randomUUID();

    await this.sql`
      INSERT INTO mcp_access_tokens (id, user_id, label, token_hash, token_prefix, token_suffix, created_at)
      VALUES (${id}, ${userId}, ${label}, ${tokenHash}, ${tokenPrefix}, ${tokenSuffix}, NOW())
    `;

    return {
      id,
      label,
      token,
      created_at: new Date()
    };
  }

  async listTokens(userId: string): Promise<TokenRecord[]> {
    const rows = await this.sql`
      SELECT id, user_id, label, token_prefix, token_suffix, created_at, last_used_at, revoked_at
      FROM mcp_access_tokens
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows as any[];
  }

  async revokeToken(userId: string, tokenId: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE mcp_access_tokens
      SET revoked_at = NOW()
      WHERE id = ${tokenId} AND user_id = ${userId} AND revoked_at IS NULL
      RETURNING id
    `;
    return result.length > 0;
  }

  async deleteToken(userId: string, tokenId: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM mcp_access_tokens
      WHERE id = ${tokenId} AND user_id = ${userId}
      RETURNING id
    `;
    return result.length > 0;
  }

  async authenticateToken(token: string): Promise<string | null> {
    if (!token) return null;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const rows = await this.sql`
      UPDATE mcp_access_tokens
      SET last_used_at = NOW()
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
      RETURNING user_id
    `;
    if (rows.length === 0) return null;
    return rows[0].user_id;
  }
}

export class MemoryTokenStore implements TokenStore {
  private tokens = new Map<string, {
    id: string;
    userId: string;
    label: string;
    tokenHash: string;
    tokenPrefix: string;
    tokenSuffix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>();

  async createToken(userId: string, label: string) {
    const rawRandom = crypto.randomBytes(32).toString("base64url");
    const token = `mcp_${rawRandom}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokenPrefix = token.slice(0, 8);
    const tokenSuffix = token.slice(-4);
    const id = crypto.randomUUID();

    const record = {
      id,
      userId,
      label,
      tokenHash,
      tokenPrefix,
      tokenSuffix,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null
    };

    this.tokens.set(id, record);

    return {
      id,
      label,
      token,
      created_at: new Date(record.createdAt)
    };
  }

  async listTokens(userId: string): Promise<TokenRecord[]> {
    return Array.from(this.tokens.values())
      .filter(t => t.userId === userId)
      .map(t => ({
        id: t.id,
        user_id: t.userId,
        label: t.label,
        token_prefix: t.tokenPrefix,
        token_suffix: t.tokenSuffix,
        created_at: t.createdAt,
        last_used_at: t.lastUsedAt,
        revoked_at: t.revokedAt
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async revokeToken(userId: string, tokenId: string): Promise<boolean> {
    const record = this.tokens.get(tokenId);
    if (!record || record.userId !== userId || record.revokedAt !== null) {
      return false;
    }
    record.revokedAt = new Date().toISOString();
    return true;
  }

  async deleteToken(userId: string, tokenId: string): Promise<boolean> {
    const record = this.tokens.get(tokenId);
    if (!record || record.userId !== userId) {
      return false;
    }
    return this.tokens.delete(tokenId);
  }

  async authenticateToken(token: string): Promise<string | null> {
    if (!token) return null;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const match = Array.from(this.tokens.values()).find(t => t.tokenHash === tokenHash && t.revokedAt === null);
    if (!match) return null;
    match.lastUsedAt = new Date().toISOString();
    return match.userId;
  }
}

export function getTokenStore(store: any): TokenStore {
  if (process.env.NODE_ENV === "test" || store.constructor.name === "MemoryExpenseStore") {
    if (!(globalThis as any).__memoryTokenStore__) {
      (globalThis as any).__memoryTokenStore__ = new MemoryTokenStore();
    }
    return (globalThis as any).__memoryTokenStore__;
  }
  return new PostgresTokenStore();
}
