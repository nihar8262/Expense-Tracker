import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { ExpenseForm, ExpensesQuery } from "../types";
import * as api from "../services/api";
import {
  createLocalExpense,
  deleteLocalExpense,
  getLocalPersonalAggregation,
  listLocalExpenses,
  updateLocalExpense
} from "../services/localDeviceStore";
import { isAndroidApp } from "../utils/platform";

export function useExpenses() {
  return {
    listExpenses: useCallback((user: User, query?: string | ExpensesQuery, sortNewestFirst?: boolean) => {
      if (isAndroidApp) {
        const resolvedQuery = typeof query === "string"
          ? { category: query || undefined, sort: sortNewestFirst ? "date_desc" as const : "date_asc" as const }
          : query;
        return listLocalExpenses(user, resolvedQuery);
      }
      return api.listExpenses(user, query, sortNewestFirst);
    }, []),
    getPersonalAggregation: useCallback((user: User) => isAndroidApp ? getLocalPersonalAggregation(user) : api.getPersonalAggregation(user), []),
    createExpense: useCallback((payload: ExpenseForm, idempotencyKey: string, user: User) => isAndroidApp ? createLocalExpense(payload, user) : api.createExpense(payload, idempotencyKey, user), []),
    updateExpense: useCallback((expenseId: string, payload: ExpenseForm, user: User) => isAndroidApp ? updateLocalExpense(expenseId, payload, user) : api.updateExpense(expenseId, payload, user), []),
    deleteExpense: useCallback((expenseId: string, user: User) => isAndroidApp ? deleteLocalExpense(expenseId, user) : api.deleteExpense(expenseId, user), [])
  };
}
