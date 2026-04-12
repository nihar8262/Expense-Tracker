import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type { CreateBudgetInput, CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";
import { BudgetNotFoundError, type BudgetRecord, ExpenseNotFoundError, IdempotencyConflictError, type CreateExpenseResult, type ExpenseRecord, type ExpenseStore } from "./types.js";

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

type BudgetRow = {
  id: string;
  amount_minor: number | string;
  budget_scope: "monthly" | "category";
  category: string | null;
  budget_month: string;
  created_at: string | Date;
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

function mapBudget(row: BudgetRow): BudgetRecord {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    scope: row.budget_scope,
    category: row.category,
    month: row.budget_month,
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
    async createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        const scopedIdempotencyKey = `${userId}:${idempotencyKey}`;
        const requestHash = createExpenseRequestHash(input);
        const existingExpense = await getExistingExpense(tx, scopedIdempotencyKey, requestHash);

        if (existingExpense) {
          return existingExpense;
        }

        const expenseId = randomUUID();
        const createdAt = new Date().toISOString();

        const insertedExpenses = await tx<ExpenseRow[]>`
          INSERT INTO expenses (id, user_id, amount_minor, category, description, expense_date, created_at)
          VALUES (${expenseId}, ${userId}, ${input.amount}, ${input.category.trim()}, ${input.description.trim()}, ${input.date}, ${createdAt})
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
    },

    async listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
      await ensureSchema(sql);

      const whereClause = query.category
        ? sql`WHERE user_id = ${userId} AND category = ${query.category}`
        : sql`WHERE user_id = ${userId}`;
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
    },

    async updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
      await ensureSchema(sql);

      const updatedRows = await sql<ExpenseRow[]>`
        UPDATE expenses
        SET amount_minor = ${input.amount},
            category = ${input.category.trim()},
            description = ${input.description.trim()},
            expense_date = ${input.date}
        WHERE id = ${expenseId} AND user_id = ${userId}
        RETURNING id, amount_minor, category, description, expense_date, created_at
      `;

      const updatedExpense = updatedRows[0];

      if (!updatedExpense) {
        throw new ExpenseNotFoundError();
      }

      return mapExpense(updatedExpense);
    },

    async deleteExpense(userId: string, expenseId: string): Promise<void> {
      await ensureSchema(sql);

      await sql.begin(async (tx) => {
        const matchingExpenses = await tx<ExpenseRow[]>`
          SELECT id, amount_minor, category, description, expense_date, created_at
          FROM expenses
          WHERE id = ${expenseId} AND user_id = ${userId}
        `;

        if (!matchingExpenses[0]) {
          throw new ExpenseNotFoundError();
        }

        await tx`
          DELETE FROM idempotency_requests
          WHERE expense_id = ${expenseId}
        `;

        await tx`
          DELETE FROM expenses
          WHERE id = ${expenseId} AND user_id = ${userId}
        `;
      });
    },

    async createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
      await ensureSchema(sql);

      const budgetId = randomUUID();
      const createdAt = new Date().toISOString();
      const insertedBudgets = await sql<BudgetRow[]>`
        INSERT INTO budgets (id, user_id, amount_minor, budget_scope, category, budget_month, created_at)
        VALUES (
          ${budgetId},
          ${userId},
          ${input.amount},
          ${input.scope},
          ${input.scope === "category" ? input.category?.trim() ?? null : null},
          ${input.month},
          ${createdAt}
        )
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      return mapBudget(insertedBudgets[0]);
    },

    async listBudgets(userId: string): Promise<BudgetRecord[]> {
      await ensureSchema(sql);

      const rows = await sql<BudgetRow[]>`
        SELECT id, amount_minor, budget_scope, category, budget_month, created_at
        FROM budgets
        WHERE user_id = ${userId}
        ORDER BY budget_month DESC, created_at DESC
      `;

      return rows.map(mapBudget);
    },

    async updateBudget(userId: string, budgetId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
      await ensureSchema(sql);

      const updatedRows = await sql<BudgetRow[]>`
        UPDATE budgets
        SET amount_minor = ${input.amount},
            budget_scope = ${input.scope},
            category = ${input.scope === "category" ? input.category?.trim() ?? null : null},
            budget_month = ${input.month}
        WHERE id = ${budgetId} AND user_id = ${userId}
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      const updatedBudget = updatedRows[0];

      if (!updatedBudget) {
        throw new BudgetNotFoundError();
      }

      return mapBudget(updatedBudget);
    },

    async deleteBudget(userId: string, budgetId: string): Promise<void> {
      await ensureSchema(sql);

      const deletedRows = await sql<BudgetRow[]>`
        DELETE FROM budgets
        WHERE id = ${budgetId} AND user_id = ${userId}
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      if (!deletedRows[0]) {
        throw new BudgetNotFoundError();
      }
    },

    async deleteUserData(userId: string): Promise<void> {
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

        await tx`
          DELETE FROM budgets
          WHERE user_id = ${userId}
        `;
      });
    }
  };
}