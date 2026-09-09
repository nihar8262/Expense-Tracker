import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { BudgetForm, SplitRule } from "../types";
import * as api from "../services/api";

export function useWallets() {
  return {
    listWallets: useCallback((user: User) => api.listWallets(user), []),
    getWalletDetail: useCallback((walletId: string, user: User, expenseOffset?: number, expenseLimit?: number) => api.getWalletDetail(walletId, user, expenseOffset, expenseLimit), []),
    createWallet: useCallback((input: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> }, user: User) => api.createWallet(input, user), []),
    updateWallet: useCallback((walletId: string, input: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> }, user: User) => api.updateWallet(walletId, input, user), []),
    deleteWalletGroup: useCallback((walletId: string, user: User) => api.deleteWalletGroup(walletId, user), []),
    leaveWalletGroup: useCallback((walletId: string, user: User) => api.leaveWalletGroup(walletId, user), []),
    addWalletMember: useCallback((walletId: string, input: { displayName: string; email?: string }, user: User) => api.addWalletMember(walletId, input, user), []),
    removeWalletMember: useCallback((walletId: string, memberId: string, user: User) => api.removeWalletMember(walletId, memberId, user), []),
    createWalletBudget: useCallback((walletId: string, input: BudgetForm, user: User) => api.createWalletBudget(walletId, input, user), []),
    updateWalletBudget: useCallback((walletId: string, budgetId: string, input: BudgetForm, user: User) => api.updateWalletBudget(walletId, budgetId, input, user), []),
    deleteWalletBudget: useCallback((walletId: string, budgetId: string, user: User) => api.deleteWalletBudget(walletId, budgetId, user), []),
    createSharedWalletExpense: useCallback((walletId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }>; platform?: string | null }, user: User) => api.createSharedWalletExpense(walletId, input, user), []),
    updateSharedWalletExpense: useCallback((walletId: string, expenseId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }>; platform?: string | null }, user: User) => api.updateSharedWalletExpense(walletId, expenseId, input, user), []),
    deleteSharedWalletExpense: useCallback((walletId: string, expenseId: string, user: User) => api.deleteSharedWalletExpense(walletId, expenseId, user), []),
    createWalletSettlement: useCallback((walletId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }, user: User) => api.createWalletSettlement(walletId, input, user), []),
    updateWalletSettlementEntry: useCallback((walletId: string, settlementId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }, user: User) => api.updateWalletSettlementEntry(walletId, settlementId, input, user), []),
    deleteWalletSettlementEntry: useCallback((walletId: string, settlementId: string, user: User) => api.deleteWalletSettlementEntry(walletId, settlementId, user), []),
    createWalletLoan: useCallback((walletId: string, input: any, user: User) => api.createWalletLoan(walletId, input, user), []),
    updateWalletLoan: useCallback((walletId: string, loanId: string, input: any, user: User) => api.updateWalletLoan(walletId, loanId, input, user), []),
    deleteWalletLoan: useCallback((walletId: string, loanId: string, user: User) => api.deleteWalletLoan(walletId, loanId, user), []),
    createWalletLoanRepayment: useCallback((walletId: string, loanId: string, input: any, user: User) => api.createWalletLoanRepayment(walletId, loanId, input, user), []),
    deleteWalletLoanRepayment: useCallback((walletId: string, loanId: string, repaymentId: string, user: User) => api.deleteWalletLoanRepayment(walletId, loanId, repaymentId, user), []),
    listLoans: useCallback((user: User) => api.listLoans(user), []),
    createStandaloneLoan: useCallback((input: any, user: User) => api.createStandaloneLoan(input, user), []),
    updateStandaloneLoan: useCallback((loanId: string, input: any, user: User) => api.updateStandaloneLoan(loanId, input, user), []),
    deleteStandaloneLoan: useCallback((loanId: string, user: User) => api.deleteStandaloneLoan(loanId, user), []),
    createStandaloneLoanRepayment: useCallback((loanId: string, input: any, user: User) => api.createStandaloneLoanRepayment(loanId, input, user), []),
    deleteStandaloneLoanRepayment: useCallback((loanId: string, repaymentId: string, user: User) => api.deleteStandaloneLoanRepayment(loanId, repaymentId, user), [])
  };
}
