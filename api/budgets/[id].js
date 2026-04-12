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

function isValidIsoMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month] = value.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

const createBudgetSchema = z
  .object({
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
    scope: z.enum(["monthly", "category"]),
    category: z.string().trim().max(64, "Category is too long.").optional(),
    month: z.string().trim().refine(isValidIsoMonth, "Month must be a valid YYYY-MM value.")
  })
  .superRefine((value, context) => {
    if (value.scope === "category" && !value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Category is required for a category budget."
      });
    }

    if (value.scope === "monthly" && value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Monthly budgets cannot target a specific category."
      });
    }
  });

function asIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapBudget(row) {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    scope: row.budget_scope,
    category: row.category,
    month: row.budget_month,
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
        CREATE TABLE IF NOT EXISTS budgets (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')),
          category VARCHAR(64),
          budget_month CHAR(7) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          CHECK (
            (budget_scope = 'monthly' AND category IS NULL)
            OR (budget_scope = 'category' AND category IS NOT NULL)
          )
        )
      `;
    })();
  }

  await schemaReady;
}

async function updateBudget(rawBody, budgetId, userId) {
  const result = createBudgetSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid budget payload.",
        details: result.error.flatten()
      }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    UPDATE budgets
    SET amount_minor = ${result.data.amount},
        budget_scope = ${result.data.scope},
        category = ${result.data.scope === "category" ? result.data.category?.trim() ?? null : null},
        budget_month = ${result.data.month}
    WHERE id = ${budgetId} AND user_id = ${userId}
    RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
  `;

  if (!rows[0]) {
    return {
      status: 404,
      body: { error: "Budget not found." }
    };
  }

  return {
    status: 200,
    body: { budget: mapBudget(rows[0]) }
  };
}

async function deleteBudget(budgetId, userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    DELETE FROM budgets
    WHERE id = ${budgetId} AND user_id = ${userId}
    RETURNING id
  `;

  if (!rows[0]) {
    return {
      status: 404,
      body: { error: "Budget not found." }
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

  const budgetId = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;

  if (request.method === "PUT") {
    try {
      const result = await updateBudget(request.body, budgetId, user.id);
      return response.status(result.status).json(result.body);
    } catch {
      return response.status(500).json({ error: "Failed to update budget." });
    }
  }

  if (request.method === "DELETE") {
    try {
      const result = await deleteBudget(budgetId, user.id);

      if (result.body === null) {
        return response.status(result.status).end();
      }

      return response.status(result.status).json(result.body);
    } catch {
      return response.status(500).json({ error: "Failed to delete budget." });
    }
  }

  response.setHeader("Allow", "PUT, DELETE");
  return response.status(405).end("Method Not Allowed");
};