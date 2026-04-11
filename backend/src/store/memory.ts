import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type { CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";
import { IdempotencyConflictError, type CreateExpenseResult, type ExpenseRecord, type ExpenseStore } from "./types.js";

type StoredExpense = {
  id: string;
  amountMinor: number;
  category: string;
  description: string;
  date: string;
  createdAt: string;
};

type StoredIdempotency = {
  requestHash: string;
  expenseId: string;
};

function mapExpense(expense: StoredExpense): ExpenseRecord {
  return {
    id: expense.id,
    amount: formatMinorUnits(expense.amountMinor),
    category: expense.category,
    description: expense.description,
    date: expense.date,
    created_at: expense.createdAt
  };
}

export function createMemoryExpenseStore(): ExpenseStore {
  const expenses = new Map<string, StoredExpense>();
  const idempotencyRequests = new Map<string, StoredIdempotency>();

  async function createExpense(input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
    const requestHash = createExpenseRequestHash(input);
    const existingRequest = idempotencyRequests.get(idempotencyKey);

    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }

      const existingExpense = expenses.get(existingRequest.expenseId);

      if (!existingExpense) {
        throw new Error("Stored idempotency record is missing its expense.");
      }

      return {
        expense: mapExpense(existingExpense),
        created: false
      };
    }

    const nextExpense: StoredExpense = {
      id: randomUUID(),
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      createdAt: new Date().toISOString()
    };

    expenses.set(nextExpense.id, nextExpense);
    idempotencyRequests.set(idempotencyKey, {
      requestHash,
      expenseId: nextExpense.id
    });

    return {
      expense: mapExpense(nextExpense),
      created: true
    };
  }

  async function listExpenses(query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
    const filteredExpenses = [...expenses.values()]
      .filter((expense) => !query.category || expense.category === query.category)
      .sort((left, right) => {
        if (query.sort === "date_desc") {
          const byDate = right.date.localeCompare(left.date);
          return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
        }

        return right.createdAt.localeCompare(left.createdAt);
      });

    return filteredExpenses.map(mapExpense);
  }

  return {
    createExpense,
    listExpenses
  };
}