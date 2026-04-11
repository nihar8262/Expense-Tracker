const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const postgres = require("postgres");
const { z } = require("zod");

function parseAmountToMinorUnits(value) {
  const raw = typeof value === "number" ? value.toString() : String(value ?? "");
  const trimmed = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Amount must be a valid positive number with up to 2 decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const minorUnits = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));

  if (minorUnits <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large.");
  }

  return Number(minorUnits);
}

function formatMinorUnits(value) {
  const whole = Math.trunc(value / 100);
  const fraction = Math.abs(value % 100)
    .toString()
    .padStart(2, "0");

  return `${whole}.${fraction}`;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const createExpenseSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: error instanceof Error ? error.message : "Invalid amount."
      });
      return z.NEVER;
    }
  }),
  category: z.string().trim().min(1, "Category is required.").max(64, "Category is too long."),
  description: z.string().trim().min(1, "Description is required.").max(280, "Description is too long."),
  date: z.string().trim().refine(isValidIsoDate, "Date must be a valid YYYY-MM-DD value.")
});

function asIsoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function asIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapExpense(row) {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    category: row.category,
    description: row.description,
    date: asIsoDate(row.expense_date),
    created_at: asIsoTimestamp(row.created_at)
  };
}

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
      await sql`UPDATE expenses SET user_id = 'legacy-anonymous' WHERE user_id IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS expenses_user_id_expense_date_idx ON expenses (user_id, expense_date DESC, created_at DESC)`;

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

async function updateExpense(rawBody, expenseId, userId) {
  const result = createExpenseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid expense payload.",
        details: result.error.flatten()
      }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    UPDATE expenses
    SET amount_minor = ${result.data.amount},
        category = ${result.data.category.trim()},
        description = ${result.data.description.trim()},
        expense_date = ${result.data.date}
    WHERE id = ${expenseId} AND user_id = ${userId}
    RETURNING id, amount_minor, category, description, expense_date, created_at
  `;

  if (!rows[0]) {
    return {
      status: 404,
      body: { error: "Expense not found." }
    };
  }

  return {
    status: 200,
    body: { expense: mapExpense(rows[0]) }
  };
}

async function deleteExpense(expenseId, userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const deleted = await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT id
      FROM expenses
      WHERE id = ${expenseId} AND user_id = ${userId}
    `;

    if (!rows[0]) {
      return false;
    }

    await tx`
      DELETE FROM idempotency_requests
      WHERE expense_id = ${expenseId}
    `;

    await tx`
      DELETE FROM expenses
      WHERE id = ${expenseId} AND user_id = ${userId}
    `;

    return true;
  });

  if (!deleted) {
    return {
      status: 404,
      body: { error: "Expense not found." }
    };
  }

  return {
    status: 204,
    body: null
  };
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

  const expenseId = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;

  if (!expenseId) {
    return response.status(400).json({ error: "Expense id is required." });
  }

  if (request.method === "PUT") {
    const result = await updateExpense(request.body, expenseId, user.id);
    return response.status(result.status).json(result.body);
  }

  if (request.method === "DELETE") {
    const result = await deleteExpense(expenseId, user.id);

    if (result.body === null) {
      return response.status(result.status).end();
    }

    return response.status(result.status).json(result.body);
  }

  response.setHeader("Allow", "PUT, DELETE");
  return response.status(405).end("Method Not Allowed");
};