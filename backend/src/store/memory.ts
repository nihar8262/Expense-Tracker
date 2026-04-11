import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type { CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";
import { ExpenseNotFoundError, IdempotencyConflictError, type CreateExpenseResult, type ExpenseRecord, type ExpenseStore } from "./types.js";

type StoredExpense = {
  id: string;
  userId: string;
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

  async function createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
    const scopedIdempotencyKey = `${userId}:${idempotencyKey}`;
    const requestHash = createExpenseRequestHash(input);
    const existingRequest = idempotencyRequests.get(scopedIdempotencyKey);

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
      userId,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      createdAt: new Date().toISOString()
    };

    expenses.set(nextExpense.id, nextExpense);
    idempotencyRequests.set(scopedIdempotencyKey, {
      requestHash,
      expenseId: nextExpense.id
    });

    return {
      expense: mapExpense(nextExpense),
      created: true
    };
  }

  async function listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
    const filteredExpenses = [...expenses.values()]
      .filter((expense) => expense.userId === userId)
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

  async function updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
    const existingExpense = expenses.get(expenseId);

    if (!existingExpense || existingExpense.userId !== userId) {
      throw new ExpenseNotFoundError();
    }

    const updatedExpense: StoredExpense = {
      ...existingExpense,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date
    };

    expenses.set(expenseId, updatedExpense);
    return mapExpense(updatedExpense);
  }

  async function deleteExpense(userId: string, expenseId: string): Promise<void> {
    const existingExpense = expenses.get(expenseId);

    if (!existingExpense || existingExpense.userId !== userId) {
      throw new ExpenseNotFoundError();
    }

    expenses.delete(expenseId);

    for (const [key, value] of idempotencyRequests.entries()) {
      if (value.expenseId === expenseId) {
        idempotencyRequests.delete(key);
      }
    }
  }

  async function deleteUserData(userId: string): Promise<void> {
    for (const [expenseId, expense] of expenses.entries()) {
      if (expense.userId === userId) {
        expenses.delete(expenseId);
      }
    }

    for (const [key] of idempotencyRequests.entries()) {
      if (key.startsWith(`${userId}:`)) {
        idempotencyRequests.delete(key);
      }
    }
  }

  return {
    createExpense,
    listExpenses,
    updateExpense,
    deleteExpense,
    deleteUserData
  };
}