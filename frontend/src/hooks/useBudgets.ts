import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { BudgetForm } from "../types";
import * as api from "../services/api";

export function useBudgets() {
  return {
    listBudgets: useCallback((user: User) => api.listBudgets(user), []),
    createBudget: useCallback((payload: BudgetForm, user: User) => api.createBudget(payload, user), []),
    updateBudget: useCallback((budgetId: string, payload: BudgetForm, user: User) => api.updateBudget(budgetId, payload, user), []),
    deleteBudget: useCallback((budgetId: string, user: User) => api.deleteBudget(budgetId, user), [])
  };
}
