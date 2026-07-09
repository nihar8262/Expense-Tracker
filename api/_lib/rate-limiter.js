const postgres = require("postgres");

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

// Config limits
const LIMITS = {
  mcp: { maxTokens: 60, refillRate: 1.0 },       // 60 tokens per minute = 1.0 token/sec
  chat: { maxTokens: 10, refillRate: 10 / 60 }    // 10 tokens per minute = 0.1667 token/sec
};

/**
 * Checks if the request is rate limited for the given key and type.
 * @param {string} key - Unique rate limit identifier (e.g., 'mcp:userId' or 'chat:userId')
 * @param {'mcp' | 'chat'} type - Type of rate limit to apply.
 * @returns {Promise<{ allowed: boolean, tokens: number }>}
 */
async function checkRateLimit(key, type) {
  const limit = LIMITS[type];
  if (!limit) {
    throw new Error(`Invalid rate limit type: ${type}`);
  }

  const sql = getSql();
  const { maxTokens, refillRate } = limit;
  const now = new Date();

  // Run in transaction to prevent race conditions in serverless environment
  const result = await sql.begin(async (tx) => {
    // 1. Ensure the row exists
    await tx`
      INSERT INTO rate_limits (key, tokens, last_refilled_at)
      VALUES (${key}, ${maxTokens}, ${now})
      ON CONFLICT (key) DO NOTHING
    `;

    // 2. Lock and retrieve the current state
    const rows = await tx`
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

    // 3. Calculate new token count based on time elapsed
    const elapsedSeconds = Math.max(0, (now.getTime() - dbLastRefilled.getTime()) / 1000);
    const refilled = elapsedSeconds * refillRate;
    let newTokens = Math.min(maxTokens, dbTokens + refilled);

    let allowed = false;
    if (newTokens >= 1.0) {
      newTokens -= 1.0;
      allowed = true;
    }

    // 4. Update the state
    await tx`
      UPDATE rate_limits
      SET tokens = ${newTokens}, last_refilled_at = ${now}
      WHERE key = ${key}
    `;

    return { allowed, tokens: newTokens };
  });

  return result;
}

module.exports = {
  checkRateLimit
};
