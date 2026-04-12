import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type { CreateBudgetInput, CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";
import { BudgetNotFoundError, type BudgetRecord, ExpenseNotFoundError, IdempotencyConflictError, type CreateExpenseResult, type ExpenseRecord, type ExpenseStore } from "./types.js";

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

type StoredBudget = {
  id: string;
  userId: string;
  amountMinor: number;
  scope: "monthly" | "category";
  category: string | null;
  month: string;
  createdAt: string;
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

function mapBudget(budget: StoredBudget): BudgetRecord {
  return {
    id: budget.id,
    amount: formatMinorUnits(budget.amountMinor),
    scope: budget.scope,
    category: budget.category,
    month: budget.month,
    created_at: budget.createdAt
  };
}

export function createMemoryExpenseStore(): ExpenseStore {
  const expenses = new Map<string, StoredExpense>();
  const budgets = new Map<string, StoredBudget>();
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

  async function createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    const nextBudget: StoredBudget = {
      id: randomUUID(),
      userId,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month,
      createdAt: new Date().toISOString()
    };

    budgets.set(nextBudget.id, nextBudget);
    return mapBudget(nextBudget);
  }

  async function listBudgets(userId: string): Promise<BudgetRecord[]> {
    return [...budgets.values()]
      .filter((budget) => budget.userId === userId)
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);
        return byMonth !== 0 ? byMonth : right.createdAt.localeCompare(left.createdAt);
      })
      .map(mapBudget);
  }

  async function updateBudget(userId: string, budgetId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    const existingBudget = budgets.get(budgetId);

    if (!existingBudget || existingBudget.userId !== userId) {
      throw new BudgetNotFoundError();
    }

    const updatedBudget: StoredBudget = {
      ...existingBudget,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month
    };

    budgets.set(budgetId, updatedBudget);
    return mapBudget(updatedBudget);
  }

  async function deleteBudget(userId: string, budgetId: string): Promise<void> {
    const existingBudget = budgets.get(budgetId);

    if (!existingBudget || existingBudget.userId !== userId) {
      throw new BudgetNotFoundError();
    }

    budgets.delete(budgetId);
  }

  async function deleteUserData(userId: string): Promise<void> {
    for (const [expenseId, expense] of expenses.entries()) {
      if (expense.userId === userId) {
        expenses.delete(expenseId);
      }
    }

    for (const [budgetId, budget] of budgets.entries()) {
      if (budget.userId === userId) {
        budgets.delete(budgetId);
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
    createBudget,
    listBudgets,
    updateBudget,
    deleteBudget,
    deleteUserData
  };
}