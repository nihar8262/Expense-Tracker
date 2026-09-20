import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { ExpenseForm, ExpensesQuery } from "../types";
import * as api from "../services/api";

export function useExpenses() {
  return {
    listExpenses: useCallback((user: User, query?: string | ExpensesQuery, sortNewestFirst?: boolean) => api.listExpenses(user, query, sortNewestFirst), []),
    getPersonalAggregation: useCallback((user: User) => api.getPersonalAggregation(user), []),
    createExpense: useCallback((payload: ExpenseForm, idempotencyKey: string, user: User) => api.createExpense(payload, idempotencyKey, user), []),
    updateExpense: useCallback((expenseId: string, payload: ExpenseForm, user: User) => api.updateExpense(expenseId, payload, user), []),
    deleteExpense: useCallback((expenseId: string, user: User) => api.deleteExpense(expenseId, user), [])
  };
}
