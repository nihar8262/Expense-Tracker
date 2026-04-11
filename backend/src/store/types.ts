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
  createExpense(input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult>;
  listExpenses(query: ExpensesQueryInput): Promise<ExpenseRecord[]>;
}

export class IdempotencyConflictError extends Error {
  constructor(message = "An expense with this idempotency key already exists for a different payload.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}