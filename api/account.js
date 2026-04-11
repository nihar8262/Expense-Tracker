const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const postgres = require("postgres");

class AuthenticationError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

class AuthenticationConfigurationError extends Error {
  constructor(message = "Firebase admin credentials are not configured.") {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

let sqlClient;
let schemaReady;

function readFirebaseAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new AuthenticationConfigurationError();
  }

  return { projectId, clientEmail, privateKey };
}

function getFirebaseAuth() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(readFirebaseAdminCredentials())
    });
  }

  return getAuth();
}

async function authenticateRequest(request) {
  const headerValue = request.headers.authorization;
  const token = headerValue && headerValue.startsWith("Bearer ") ? headerValue.slice(7).trim() : "";

  if (!token) {
    throw new AuthenticationError();
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    return { id: decoded.uid };
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) {
      throw error;
    }

    throw new AuthenticationError("Your login session is invalid or expired.");
  }
}

function getSqlClient() {
  if (sqlClient) {
    return sqlClient;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  sqlClient = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  });

  return sqlClient;
}

async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY,
          user_id TEXT,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          category VARCHAR(64) NOT NULL,
          description VARCHAR(280) NOT NULL,
          expense_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT`;

      await sql`
        CREATE TABLE IF NOT EXISTS idempotency_requests (
          idempotency_key VARCHAR(255) PRIMARY KEY,
          request_hash TEXT NOT NULL,
          expense_id UUID NOT NULL REFERENCES expenses(id),
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
  }

  await schemaReady;
}

async function deleteAccountData(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM idempotency_requests
      WHERE idempotency_key LIKE ${`${userId}:%`}
         OR expense_id IN (
           SELECT id
           FROM expenses
           WHERE user_id = ${userId}
         )
    `;

    await tx`
      DELETE FROM expenses
      WHERE user_id = ${userId}
    `;
  });
}

module.exports = async function handler(request, response) {
  let user;

  try {
    user = await authenticateRequest(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return response.status(401).json({ error: error.message });
    }

    if (error instanceof AuthenticationConfigurationError) {
      return response.status(500).json({ error: error.message });
    }

    return response.status(500).json({ error: "Failed to authenticate request." });
  }

  if (request.method === "DELETE") {
    try {
      await deleteAccountData(user.id);
      return response.status(204).end();
    } catch {
      return response.status(500).json({ error: "Failed to delete account data." });
    }
  }

  response.setHeader("Allow", "DELETE");
  return response.status(405).end("Method Not Allowed");
};