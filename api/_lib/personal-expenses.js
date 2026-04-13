const { createHash, randomUUID } = require("node:crypto");
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

const expensesQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  sort: z.enum(["date_desc"]).optional()
});

function createExpenseRequestHash(input) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        amount: input.amount,
        category: input.category.trim(),
        description: input.description.trim(),
        date: input.date
      })
    )
    .digest("hex");
}

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

async function getExistingExpense(tx, idempotencyKey, requestHash) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

  const existingRequests = await tx`
    SELECT request_hash, expense_id
    FROM idempotency_requests
    WHERE idempotency_key = ${idempotencyKey}
  `;

  const existingRequest = existingRequests[0];

  if (!existingRequest) {
    return null;
  }

  if (existingRequest.request_hash !== requestHash) {
    const error = new Error("An expense with this idempotency key already exists for a different payload.");
    error.name = "IdempotencyConflictError";
    throw error;
  }

  const expenses = await tx`
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
    WHERE id = ${existingRequest.expense_id}
  `;

  if (!expenses[0]) {
    throw new Error("Stored idempotency record is missing its expense.");
  }

  return {
    expense: mapExpense(expenses[0]),
    created: false
  };
}

async function listExpenses(rawQuery, userId) {
  const result = expensesQuerySchema.safeParse(rawQuery);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid query parameters.",
        details: result.error.flatten()
      }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const whereClause = result.data.category
    ? sql`WHERE user_id = ${userId} AND category = ${result.data.category}`
    : sql`WHERE user_id = ${userId}`;
  const orderClause = result.data.sort === "date_desc"
    ? sql`ORDER BY expense_date DESC, created_at DESC`
    : sql`ORDER BY created_at DESC`;

  const rows = await sql`
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
    ${whereClause}
    ${orderClause}
  `;

  return {
    status: 200,
    body: {
      expenses: rows.map(mapExpense)
    }
  };
}

async function createExpense(rawBody, rawIdempotencyKey, userId) {
  const idempotencyKey = rawIdempotencyKey && String(rawIdempotencyKey).trim();

  if (!idempotencyKey) {
    return {
      status: 400,
      body: {
        error: "Idempotency-Key header is required."
      }
    };
  }

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

  try {
    const created = await sql.begin(async (tx) => {
      const scopedIdempotencyKey = `${userId}:${idempotencyKey}`;
      const requestHash = createExpenseRequestHash(result.data);
      const existing = await getExistingExpense(tx, scopedIdempotencyKey, requestHash);

      if (existing) {
        return existing;
      }

      const expenseId = randomUUID();
      const createdAt = new Date().toISOString();

      const insertedExpenses = await tx`
        INSERT INTO expenses (id, user_id, amount_minor, category, description, expense_date, created_at)
        VALUES (${expenseId}, ${userId}, ${result.data.amount}, ${result.data.category.trim()}, ${result.data.description.trim()}, ${result.data.date}, ${createdAt})
        RETURNING id, amount_minor, category, description, expense_date, created_at
      `;

      await tx`
        INSERT INTO idempotency_requests (idempotency_key, request_hash, expense_id, created_at)
        VALUES (${scopedIdempotencyKey}, ${requestHash}, ${expenseId}, ${createdAt})
      `;

      return {
        expense: mapExpense(insertedExpenses[0]),
        created: true
      };
    });

    return {
      status: created.created ? 201 : 200,
      body: created
    };
  } catch (error) {
    if (error instanceof Error && error.name === "IdempotencyConflictError") {
      return {
        status: 409,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to create expense." }
    };
  }
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

module.exports = {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense
};