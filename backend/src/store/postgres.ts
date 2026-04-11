import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type { CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";
import { IdempotencyConflictError, type CreateExpenseResult, type ExpenseRecord, type ExpenseStore } from "./types.js";

type ExpenseRow = {
  id: string;
  amount_minor: number | string;
  category: string;
  description: string;
  expense_date: string | Date;
  created_at: string | Date;
};

type IdempotencyRow = {
  request_hash: string;
  expense_id: string;
};

declare global {
  var __expenseTrackerSql__: Sql | undefined;
  var __expenseTrackerSchemaReady__: Promise<void> | undefined;
}

function asIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function asIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapExpense(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    category: row.category,
    description: row.description,
    date: asIsoDate(row.expense_date),
    created_at: asIsoTimestamp(row.created_at)
  };
}

function getSqlClient(): Sql {
  if (globalThis.__expenseTrackerSql__) {
    return globalThis.__expenseTrackerSql__;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  });

  globalThis.__expenseTrackerSql__ = sql;
  return sql;
}

async function ensureSchema(sql: Sql): Promise<void> {
  if (!globalThis.__expenseTrackerSchemaReady__) {
    globalThis.__expenseTrackerSchemaReady__ = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          category VARCHAR(64) NOT NULL,
          description VARCHAR(280) NOT NULL,
          expense_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

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

  await globalThis.__expenseTrackerSchemaReady__;
}

async function getExistingExpense(tx: Sql | TransactionSql, idempotencyKey: string, requestHash: string): Promise<CreateExpenseResult | null> {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

  const existingRequests = await tx<IdempotencyRow[]>`
    SELECT request_hash, expense_id
    FROM idempotency_requests
    WHERE idempotency_key = ${idempotencyKey}
  `;

  const existingRequest = existingRequests[0];

  if (!existingRequest) {
    return null;
  }

  if (existingRequest.request_hash !== requestHash) {
    throw new IdempotencyConflictError();
  }

  const expenses = await tx<ExpenseRow[]>`
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
    WHERE id = ${existingRequest.expense_id}
  `;

  const expense = expenses[0];

  if (!expense) {
    throw new Error("Stored idempotency record is missing its expense.");
  }

  return {
    expense: mapExpense(expense),
    created: false
  };
}

export function createPostgresExpenseStore(): ExpenseStore {
  const sql = getSqlClient();

  return {
    async createExpense(input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        const requestHash = createExpenseRequestHash(input);
        const existingExpense = await getExistingExpense(tx, idempotencyKey, requestHash);

        if (existingExpense) {
          return existingExpense;
        }

        const expenseId = randomUUID();
        const createdAt = new Date().toISOString();

        const insertedExpenses = await tx<ExpenseRow[]>`
          INSERT INTO expenses (id, amount_minor, category, description, expense_date, created_at)
          VALUES (${expenseId}, ${input.amount}, ${input.category.trim()}, ${input.description.trim()}, ${input.date}, ${createdAt})
          RETURNING id, amount_minor, category, description, expense_date, created_at
        `;

        await tx`
          INSERT INTO idempotency_requests (idempotency_key, request_hash, expense_id, created_at)
          VALUES (${idempotencyKey}, ${requestHash}, ${expenseId}, ${createdAt})
        `;

        return {
          expense: mapExpense(insertedExpenses[0]),
          created: true
        };
      });
    },

    async listExpenses(query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
      await ensureSchema(sql);

      const whereClause = query.category
        ? sql`WHERE category = ${query.category}`
        : sql``;
      const orderClause = query.sort === "date_desc"
        ? sql`ORDER BY expense_date DESC, created_at DESC`
        : sql`ORDER BY created_at DESC`;

      const rows = await sql<ExpenseRow[]>`
        SELECT id, amount_minor, category, description, expense_date, created_at
        FROM expenses
        ${whereClause}
        ${orderClause}
      `;

      return rows.map(mapExpense);
    }
  };
}