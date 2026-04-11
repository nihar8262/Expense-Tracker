import type { CreateExpenseInput, ExpensesQueryInput } from "../lib/validation.js";

export type ExpenseRecord = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  created_at: string;
};

export type CreateExpenseResult = {
  expense: ExpenseRecord;
  created: boolean;
};

export interface ExpenseStore {
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult>;
  listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]>;
  updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord>;
  deleteExpense(userId: string, expenseId: string): Promise<void>;
  deleteUserData(userId: string): Promise<void>;
}

export class IdempotencyConflictError extends Error {
  constructor(message = "An expense with this idempotency key already exists for a different payload.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class ExpenseNotFoundError extends Error {
  constructor(message = "Expense not found.") {
    super(message);
    this.name = "ExpenseNotFoundError";
  }
}