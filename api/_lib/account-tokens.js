const postgres = require("postgres");
const crypto = require("crypto");

let sqlClient;
function getSql() {
  if (sqlClient) return sqlClient;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  sqlClient = postgres(connectionString, {
    ssl: { rejectUnauthorized: false },
    max: 1
  });
  return sqlClient;
}

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS mcp_access_tokens (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      label VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      token_prefix VARCHAR(16) NOT NULL,
      token_suffix VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `;
  schemaReady = true;
}

async function createToken(userId, label) {
  const sql = getSql();
  await ensureSchema(sql);

  const rawRandom = crypto.randomBytes(32).toString("base64url");
  const token = `mcp_${rawRandom}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const tokenPrefix = token.slice(0, 8); // e.g. "mcp_abcd"
  const tokenSuffix = token.slice(-4);  // e.g. "wxyz"

  const id = crypto.randomUUID();

  await sql`
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

async function listTokens(userId) {
  const sql = getSql();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT id, label, token_prefix, token_suffix, created_at, last_used_at, revoked_at
    FROM mcp_access_tokens
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return rows;
}

async function revokeToken(userId, tokenId) {
  const sql = getSql();
  await ensureSchema(sql);

  const result = await sql`
    UPDATE mcp_access_tokens
    SET revoked_at = NOW()
    WHERE id = ${tokenId} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;

  return result.length > 0;
}

async function deleteToken(userId, tokenId) {
  const sql = getSql();
  await ensureSchema(sql);

  const result = await sql`
    DELETE FROM mcp_access_tokens
    WHERE id = ${tokenId} AND user_id = ${userId}
    RETURNING id
  `;

  return result.length > 0;
}

async function authenticateToken(token) {
  if (!token) return null;
  const sql = getSql();
  await ensureSchema(sql);

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await sql`
    UPDATE mcp_access_tokens
    SET last_used_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    RETURNING user_id
  `;

  if (rows.length === 0) return null;
  return rows[0].user_id;
}

module.exports = {
  createToken,
  listTokens,
  revokeToken,
  deleteToken,
  authenticateToken
};
