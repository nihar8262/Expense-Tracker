import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { formatMinorUnits } from "./lib/money.js";
import type { CreateExpenseInput, ExpensesQueryInput } from "./lib/validation.js";

export type ExpenseRecord = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  created_at: string;
};

type RawExpenseRow = {
  id: string;
  amount_minor: number;
  category: string;
  description: string;
  expense_date: string;
  created_at: string;
};

type IdempotencyRow = {
  idempotency_key: string;
  request_hash: string;
  expense_id: string;
};

function mapExpenseRow(row: RawExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    amount: formatMinorUnits(row.amount_minor),
    category: row.category,
    description: row.description,
    date: row.expense_date,
    created_at: row.created_at
  };
}

function hashExpense(input: CreateExpenseInput): string {
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

export function initializeDatabase(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_requests (
      idempotency_key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      expense_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id)
    );
  `);

  const insertExpenseStatement = database.prepare(`
    INSERT INTO expenses (id, amount_minor, category, description, expense_date, created_at)
    VALUES (@id, @amount_minor, @category, @description, @expense_date, @created_at)
  `);

  const insertIdempotencyStatement = database.prepare(`
    INSERT INTO idempotency_requests (idempotency_key, request_hash, expense_id, created_at)
    VALUES (@idempotency_key, @request_hash, @expense_id, @created_at)
  `);

  const getIdempotencyStatement = database.prepare(`
    SELECT idempotency_key, request_hash, expense_id
    FROM idempotency_requests
    WHERE idempotency_key = ?
  `);

  const getExpenseByIdStatement = database.prepare(`
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
    WHERE id = ?
  `);

  const listExpensesBase = `
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
  `;

  const createExpenseTransaction = database.transaction(
    (input: CreateExpenseInput, idempotencyKey: string) => {
      const requestHash = hashExpense(input);
      const existingRequest = getIdempotencyStatement.get(idempotencyKey) as IdempotencyRow | undefined;

      if (existingRequest) {
        if (existingRequest.request_hash !== requestHash) {
          throw new Error("An expense with this idempotency key already exists for a different payload.");
        }

        const existingExpense = getExpenseByIdStatement.get(existingRequest.expense_id) as RawExpenseRow | undefined;

        if (!existingExpense) {
          throw new Error("Stored idempotency record is missing its expense.");
        }

        return {
          expense: mapExpenseRow(existingExpense),
          created: false
        };
      }

      const expenseId = randomUUID();
      const createdAt = new Date().toISOString();

      insertExpenseStatement.run({
        id: expenseId,
        amount_minor: input.amount,
        category: input.category.trim(),
        description: input.description.trim(),
        expense_date: input.date,
        created_at: createdAt
      });

      insertIdempotencyStatement.run({
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        expense_id: expenseId,
        created_at: createdAt
      });

      const createdExpense = getExpenseByIdStatement.get(expenseId) as RawExpenseRow | undefined;

      if (!createdExpense) {
        throw new Error("Failed to load created expense.");
      }

      return {
        expense: mapExpenseRow(createdExpense),
        created: true
      };
    }
  );

  return {
    createExpense(input: CreateExpenseInput, idempotencyKey: string) {
      return createExpenseTransaction(input, idempotencyKey);
    },
    listExpenses(query: ExpensesQueryInput): ExpenseRecord[] {
      const clauses: string[] = [];
      const params: Array<string> = [];

      if (query.category) {
        clauses.push("category = ?");
        params.push(query.category);
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const orderByClause = query.sort === "date_desc"
        ? "ORDER BY expense_date DESC, created_at DESC"
        : "ORDER BY created_at DESC";

      const statement = database.prepare(`
        ${listExpensesBase}
        ${whereClause}
        ${orderByClause}
      `);

      return (statement.all(...params) as RawExpenseRow[]).map(mapExpenseRow);
    },
    close() {
      database.close();
    }
  };
}

export type ExpenseDatabase = ReturnType<typeof initializeDatabase>;