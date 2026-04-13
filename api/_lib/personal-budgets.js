const { randomUUID } = require("node:crypto");
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

let sqlClient;
let schemaReady;

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

      await sql`CREATE INDEX IF NOT EXISTS budgets_user_id_budget_month_idx ON budgets (user_id, budget_month DESC, created_at DESC)`;
    })();
  }

  await schemaReady;
}

async function listBudgets(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT id, amount_minor, budget_scope, category, budget_month, created_at
    FROM budgets
    WHERE user_id = ${userId}
    ORDER BY budget_month DESC, created_at DESC
  `;

  return {
    status: 200,
    body: { budgets: rows.map(mapBudget) }
  };
}

async function createBudget(rawBody, userId) {
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

  const budgetId = randomUUID();
  const createdAt = new Date().toISOString();
  const rows = await sql`
    INSERT INTO budgets (id, user_id, amount_minor, budget_scope, category, budget_month, created_at)
    VALUES (
      ${budgetId},
      ${userId},
      ${result.data.amount},
      ${result.data.scope},
      ${result.data.scope === "category" ? result.data.category?.trim() ?? null : null},
      ${result.data.month},
      ${createdAt}
    )
    RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
  `;

  return {
    status: 201,
    body: { budget: mapBudget(rows[0]) }
  };
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

module.exports = {
  createBudget,
  deleteBudget,
  listBudgets,
  updateBudget
};