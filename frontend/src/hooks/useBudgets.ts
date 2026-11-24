import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { BudgetForm } from "../types";
import * as api from "../services/api";
import { createLocalBudget, deleteLocalBudget, listLocalBudgets, updateLocalBudget } from "../services/localDeviceStore";
import { isAndroidApp } from "../utils/platform";

export function useBudgets() {
  return {
    listBudgets: useCallback((user: User) => isAndroidApp ? listLocalBudgets(user) : api.listBudgets(user), []),
    createBudget: useCallback((payload: BudgetForm, user: User) => isAndroidApp ? createLocalBudget(payload, user) : api.createBudget(payload, user), []),
    updateBudget: useCallback((budgetId: string, payload: BudgetForm, user: User) => isAndroidApp ? updateLocalBudget(budgetId, payload, user) : api.updateBudget(budgetId, payload, user), []),
    deleteBudget: useCallback((budgetId: string, user: User) => isAndroidApp ? deleteLocalBudget(budgetId, user) : api.deleteBudget(budgetId, user), [])
  };
}
