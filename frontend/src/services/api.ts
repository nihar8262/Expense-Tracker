import axios, { type AxiosRequestConfig } from "axios";
import type { User } from "firebase/auth";
import type {
  BillReminder,
  BillReminderRecurrence,
  BudgetForm,
  ExpenseForm,
  ExpensesQuery,
  Notification,
  PaginatedExpenses,
  PersonalAggregation,
  ReminderPreferences,
  SplitRule,
  Wallet,
  WalletDetail,
  WalletLoan,
  WalletLoanForm,
  WalletLoanRepaymentForm,
  WalletLoanRepaymentUpdateForm
} from "../types";
import { ApiError } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined
});

type ApiRequestConfig = Omit<AxiosRequestConfig, "headers"> & {
  headers?: Record<string, string>;
};

async function buildAuthorizedHeaders(user: User, extraHeaders: Record<string, string> = {}) {
  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders
  };
}

function createApiError(error: unknown, fallbackMessage: string): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;
    let message = fallbackMessage;
    if (typeof data === "string" && data.trim()) {
      message = data;
    } else if (data && typeof data === "object") {
      const errorField = (data as Record<string, unknown>).error;
      const messageField = (data as Record<string, unknown>).message;
      if (typeof errorField === "string" && errorField.trim()) {
        message = errorField;
      } else if (typeof messageField === "string" && messageField.trim()) {
        message = messageField;
      } else if (errorField && typeof errorField === "object") {
        message = (errorField as Record<string, unknown>).message as string || JSON.stringify(errorField);
      }
    } else if (error.message) {
      message = error.message;
    }
    if (!message || message === "[object Object]") {
      message = fallbackMessage;
    }
    const apiError = new ApiError(message, status);
    apiError.retryable = status === 0 || status >= 500;
    return apiError;
  }

  if (error instanceof Error) {
    return new ApiError(error.message || fallbackMessage, 0);
  }

  return new ApiError(fallbackMessage, 0);
}

export async function apiRequest<T>(user: User, config: ApiRequestConfig, fallbackMessage: string): Promise<T> {
  try {
    const response = await apiClient.request<T>({
      ...config,
      headers: await buildAuthorizedHeaders(user, config.headers)
    });

    return response.data;
  } catch (error) {
    throw createApiError(error, fallbackMessage);
  }
}

export function buildExpensesUrl(query?: ExpensesQuery | string, legacySort?: boolean): string {
  const url = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL) : new URL("/api/expenses", window.location.origin);

  if (typeof query === "string") {
    if (query) {
      url.searchParams.set("category", query);
    }
    if (legacySort) {
      url.searchParams.set("sort", "date_desc");
    }
    return url.toString();
  }

  if (query) {
    if (query.category) url.searchParams.set("category", query.category);
    if (query.platform) url.searchParams.set("platform", query.platform);
    if (query.month) url.searchParams.set("month", query.month);
    if (query.from_date) url.searchParams.set("from_date", query.from_date);
    if (query.to_date) url.searchParams.set("to_date", query.to_date);
    if (query.search) url.searchParams.set("search", query.search);
    if (query.sort) url.searchParams.set("sort", query.sort);
    if (typeof query.limit === "number") url.searchParams.set("limit", String(query.limit));
    if (typeof query.offset === "number") url.searchParams.set("offset", String(query.offset));
  }

  return url.toString();
}

export function buildBudgetsUrl(): string {
  return API_BASE_URL ? new URL("/api/budgets", API_BASE_URL).toString() : "/api/budgets";
}

export function buildWalletsUrl(): string {
  return API_BASE_URL ? new URL("/api/wallets", API_BASE_URL).toString() : "/api/wallets";
}

export function buildNotificationsUrl(): string {
  return API_BASE_URL ? new URL("/api/notifications", API_BASE_URL).toString() : "/api/notifications";
}

export function buildReminderPreferencesUrl(): string {
  return API_BASE_URL ? new URL("/api/reminder-preferences", API_BASE_URL).toString() : "/api/reminder-preferences";
}

export function buildBillRemindersUrl(): string {
  return API_BASE_URL ? new URL("/api/bill-reminders", API_BASE_URL).toString() : "/api/bill-reminders";
}

export async function createExpense(payload: ExpenseForm, idempotencyKey: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL).toString() : "/api/expenses";
  await apiRequest<void>(user, {
    url: endpoint,
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey
    },
    data: payload
  }, "Failed to save expense.");
}

export async function updateExpense(expenseId: string, payload: ExpenseForm, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/expenses/${expenseId}`, API_BASE_URL).toString() : `/api/expenses/${expenseId}`;
  await apiRequest<void>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update expense.");
}

export async function deleteExpense(expenseId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/expenses/${expenseId}`, API_BASE_URL).toString() : `/api/expenses/${expenseId}`;
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete expense.");
}

export async function listExpenses(
  user: User,
  query?: ExpensesQuery | string,
  sortNewestFirst?: boolean
): Promise<PaginatedExpenses> {
  const url = buildExpensesUrl(query, sortNewestFirst);
  const body = await apiRequest<PaginatedExpenses>(user, { url, method: "GET" }, "Failed to load expenses.");
  return body;
}

export async function getPersonalAggregation(user: User): Promise<PersonalAggregation> {
  const endpoint = API_BASE_URL ? new URL("/api/expenses/summary", API_BASE_URL).toString() : "/api/expenses/summary";
  return apiRequest<PersonalAggregation>(user, { url: endpoint, method: "GET" }, "Failed to load expenses summary.");
}

export async function createBudget(payload: BudgetForm, user: User): Promise<void> {
  await apiRequest<void>(user, {
    url: buildBudgetsUrl(),
    method: "POST",
    data: {
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    }
  }, "Failed to save budget.");
}

export async function updateBudget(budgetId: string, payload: BudgetForm, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/budgets/${budgetId}`, API_BASE_URL).toString() : `/api/budgets/${budgetId}`;
  await apiRequest<void>(user, {
    url: endpoint,
    method: "PUT",
    data: {
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    }
  }, "Failed to update budget.");
}

export async function deleteBudget(budgetId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/budgets/${budgetId}`, API_BASE_URL).toString() : `/api/budgets/${budgetId}`;
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete budget.");
}

export async function listBudgets(user: User) {
  const body = await apiRequest<{ budgets: import("../types").Budget[] }>(user, { url: buildBudgetsUrl(), method: "GET" }, "Failed to load budgets.");
  return body.budgets;
}

export async function deleteAccountData(user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/account", API_BASE_URL).toString() : "/api/account";
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete account.");
}

export async function createWallet(
  payload: { name: string; description: string; defaultSplitRule: SplitRule; currency?: string; pictureUrl?: string | null; members: Array<{ displayName: string; email?: string }> },
  user: User
): Promise<WalletDetail> {
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: buildWalletsUrl(),
    method: "POST",
    data: payload
  }, "Failed to create wallet.");
  return body.wallet;
}

export async function updateWallet(
  walletId: string,
  payload: { name: string; description: string; defaultSplitRule: SplitRule; currency?: string; pictureUrl?: string | null; members: Array<{ displayName: string; email?: string }> },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update wallet.");
  return body.wallet;
}

export async function listWallets(user: User): Promise<Wallet[]> {
  const body = await apiRequest<{ wallets: Wallet[] }>(user, { url: buildWalletsUrl(), method: "GET" }, "Failed to load wallets.");
  return body.wallets;
}

export async function addWalletMember(walletId: string, payload: { displayName: string; email?: string }, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/members`, API_BASE_URL).toString() : `/api/wallets/${walletId}/members`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to add wallet member.");
  return body.wallet;
}

export async function removeWalletMember(walletId: string, memberId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL
    ? new URL(`/api/wallets/${walletId}/members/${memberId}`, API_BASE_URL).toString()
    : `/api/wallets/${walletId}/members/${memberId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, { url: endpoint, method: "DELETE" }, "Failed to remove wallet member.");
  return body.wallet;
}

export async function getWalletDetail(
  walletId: string,
  user: User,
  expenseOffset = 0,
  expenseLimit = 50
): Promise<WalletDetail> {
  const url = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL) : new URL(`/api/wallets/${walletId}`, window.location.origin);
  url.searchParams.set("expenseOffset", String(expenseOffset));
  url.searchParams.set("expenseLimit", String(expenseLimit));
  
  const endpoint = url.toString();
  const body = await apiRequest<{ wallet: WalletDetail }>(user, { url: endpoint, method: "GET" }, "Failed to load wallet.");
  return body.wallet;
}

export async function deleteWalletGroup(walletId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}`;
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete group.");
}

export async function leaveWalletGroup(walletId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/leave`, API_BASE_URL).toString() : `/api/wallets/${walletId}/leave`;
  await apiRequest<void>(user, { url: endpoint, method: "POST" }, "Failed to exit group.");
}

export async function createWalletBudget(walletId: string, payload: BudgetForm, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: {
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    }
  }, "Failed to create wallet budget.");
  return body.wallet;
}

export async function updateWalletBudget(walletId: string, walletBudgetId: string, payload: BudgetForm, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets/${walletBudgetId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets/${walletBudgetId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: {
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    }
  }, "Failed to update wallet budget.");
  return body.wallet;
}

export async function deleteWalletBudget(walletId: string, walletBudgetId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets/${walletBudgetId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets/${walletBudgetId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, { url: endpoint, method: "DELETE" }, "Failed to delete wallet budget.");
  return body.wallet;
}

export async function createSharedWalletExpense(
  walletId: string,
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }>; platform?: string | null },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to create shared expense.");
  return body.wallet;
}

export async function updateSharedWalletExpense(
  walletId: string,
  walletExpenseId: string,
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }>; platform?: string | null },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses/${walletExpenseId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses/${walletExpenseId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update shared expense.");
  return body.wallet;
}

export async function deleteSharedWalletExpense(walletId: string, walletExpenseId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses/${walletExpenseId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses/${walletExpenseId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, { url: endpoint, method: "DELETE" }, "Failed to delete shared expense.");
  return body.wallet;
}

export async function createWalletSettlement(
  walletId: string,
  payload: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to record settlement.");
  return body.wallet;
}

export async function updateWalletSettlementEntry(
  walletId: string,
  settlementId: string,
  payload: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements/${settlementId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements/${settlementId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update settlement.");
  return body.wallet;
}

export async function deleteWalletSettlementEntry(walletId: string, settlementId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements/${settlementId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements/${settlementId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, { url: endpoint, method: "DELETE" }, "Failed to delete settlement.");
  return body.wallet;
}

export async function createWalletLoan(
  walletId: string,
  payload: WalletLoanForm,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to create loan.");
  return body.wallet;
}

export async function updateWalletLoan(
  walletId: string,
  loanId: string,
  payload: Partial<WalletLoanForm>,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans/${loanId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans/${loanId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update loan.");
  return body.wallet;
}

export async function deleteWalletLoan(
  walletId: string,
  loanId: string,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans/${loanId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans/${loanId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "DELETE"
  }, "Failed to delete loan.");
  return body.wallet;
}

export async function createWalletLoanRepayment(
  walletId: string,
  loanId: string,
  payload: WalletLoanRepaymentForm,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans/${loanId}/repayments`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans/${loanId}/repayments`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to record loan repayment.");
  return body.wallet;
}

export async function updateWalletLoanRepayment(
  walletId: string,
  loanId: string,
  repaymentId: string,
  payload: WalletLoanRepaymentUpdateForm,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans/${loanId}/repayments/${repaymentId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans/${loanId}/repayments/${repaymentId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update loan repayment.");
  return body.wallet;
}

export async function deleteWalletLoanRepayment(
  walletId: string,
  loanId: string,
  repaymentId: string,
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/loans/${loanId}/repayments/${repaymentId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/loans/${loanId}/repayments/${repaymentId}`;
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: endpoint,
    method: "DELETE"
  }, "Failed to delete loan repayment.");
  return body.wallet;
}

export async function listLoans(user: User): Promise<WalletLoan[]> {
  const endpoint = API_BASE_URL ? new URL("/api/loans", API_BASE_URL).toString() : "/api/loans";
  const body = await apiRequest<{ loans: WalletLoan[] }>(user, { url: endpoint, method: "GET" }, "Failed to load loans.");
  return body.loans;
}

export async function createStandaloneLoan(
  payload: WalletLoanForm,
  user: User
): Promise<WalletLoan> {
  const endpoint = API_BASE_URL ? new URL("/api/loans", API_BASE_URL).toString() : "/api/loans";
  const body = await apiRequest<{ loan: WalletLoan }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to create loan.");
  return body.loan;
}

export async function updateStandaloneLoan(
  loanId: string,
  payload: Partial<WalletLoanForm>,
  user: User
): Promise<WalletLoan> {
  const endpoint = API_BASE_URL ? new URL(`/api/loans/${loanId}`, API_BASE_URL).toString() : `/api/loans/${loanId}`;
  const body = await apiRequest<{ loan: WalletLoan }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update loan.");
  return body.loan;
}

export async function deleteStandaloneLoan(
  loanId: string,
  user: User
): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/loans/${loanId}`, API_BASE_URL).toString() : `/api/loans/${loanId}`;
  await apiRequest<{ ok: boolean }>(user, {
    url: endpoint,
    method: "DELETE"
  }, "Failed to delete loan.");
}

export async function createStandaloneLoanRepayment(
  loanId: string,
  payload: WalletLoanRepaymentForm,
  user: User
): Promise<WalletLoan> {
  const endpoint = API_BASE_URL ? new URL(`/api/loans/${loanId}/repayments`, API_BASE_URL).toString() : `/api/loans/${loanId}/repayments`;
  const body = await apiRequest<{ loan: WalletLoan }>(user, {
    url: endpoint,
    method: "POST",
    data: payload
  }, "Failed to record loan repayment.");
  return body.loan;
}

export async function updateStandaloneLoanRepayment(
  loanId: string,
  repaymentId: string,
  payload: WalletLoanRepaymentUpdateForm,
  user: User
): Promise<WalletLoan> {
  const endpoint = API_BASE_URL ? new URL(`/api/loans/${loanId}/repayments/${repaymentId}`, API_BASE_URL).toString() : `/api/loans/${loanId}/repayments/${repaymentId}`;
  const body = await apiRequest<{ loan: WalletLoan }>(user, {
    url: endpoint,
    method: "PUT",
    data: payload
  }, "Failed to update loan repayment.");
  return body.loan;
}

export async function deleteStandaloneLoanRepayment(
  loanId: string,
  repaymentId: string,
  user: User
): Promise<WalletLoan> {
  const endpoint = API_BASE_URL ? new URL(`/api/loans/${loanId}/repayments/${repaymentId}`, API_BASE_URL).toString() : `/api/loans/${loanId}/repayments/${repaymentId}`;
  const body = await apiRequest<{ loan: WalletLoan }>(user, {
    url: endpoint,
    method: "DELETE"
  }, "Failed to delete loan repayment.");
  return body.loan;
}

export async function listBillReminders(user: User): Promise<BillReminder[]> {
  const body = await apiRequest<{ billReminders: BillReminder[] }>(user, { url: buildBillRemindersUrl(), method: "GET" }, "Failed to load bill reminders.");
  return body.billReminders;
}

export async function saveBillReminder(
  payload: { title: string; amount: string; category: string; dueDate: string; recurrence: BillReminderRecurrence; intervalCount: number; reminderDaysBefore: number; isActive: boolean },
  user: User,
  billReminderId?: string
): Promise<BillReminder> {
  const endpoint = billReminderId
    ? API_BASE_URL ? new URL(`/api/bill-reminders/${billReminderId}`, API_BASE_URL).toString() : `/api/bill-reminders/${billReminderId}`
    : buildBillRemindersUrl();
  const body = await apiRequest<{ billReminder: BillReminder }>(user, {
    url: endpoint,
    method: billReminderId ? "PUT" : "POST",
    data: payload
  }, billReminderId ? "Failed to update bill reminder." : "Failed to create bill reminder.");
  return body.billReminder;
}

export async function deleteBillReminderEntry(billReminderId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/bill-reminders/${billReminderId}`, API_BASE_URL).toString() : `/api/bill-reminders/${billReminderId}`;
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete bill reminder.");
}

export async function respondToWalletInvite(walletMemberId: string, action: "accept" | "decline", user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallet-invites/${walletMemberId}/respond`, API_BASE_URL).toString() : `/api/wallet-invites/${walletMemberId}/respond`;
  await apiRequest<void>(user, {
    url: endpoint,
    method: "POST",
    data: { action }
  }, "Failed to respond to wallet invite.");
}

export async function listNotifications(user: User): Promise<Notification[]> {
  const body = await apiRequest<{ notifications: Notification[] }>(user, { url: buildNotificationsUrl(), method: "GET" }, "Failed to load notifications.");
  return body.notifications;
}

export async function markNotificationRead(notificationId: string, user: User): Promise<Notification> {
  const endpoint = API_BASE_URL ? new URL(`/api/notifications/${notificationId}/read`, API_BASE_URL).toString() : `/api/notifications/${notificationId}/read`;
  const body = await apiRequest<{ notification: Notification }>(user, { url: endpoint, method: "PATCH" }, "Failed to update notification.");
  return body.notification;
}

export async function markAllNotificationsRead(user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/notifications/read-all", API_BASE_URL).toString() : "/api/notifications/read-all";
  await apiRequest<void>(user, { url: endpoint, method: "POST" }, "Failed to update notifications.");
}

export async function deleteNotification(notificationId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/notifications/${notificationId}`, API_BASE_URL).toString() : `/api/notifications/${notificationId}`;
  await apiRequest<void>(user, { url: endpoint, method: "DELETE" }, "Failed to delete notification.");
}

export async function runNotificationChecks(user: User): Promise<Notification[]> {
  const endpoint = API_BASE_URL ? new URL("/api/notifications/run-checks", API_BASE_URL).toString() : "/api/notifications/run-checks";
  const body = await apiRequest<{ created_notifications: Notification[] }>(user, { url: endpoint, method: "POST" }, "Failed to run reminder checks.");
  return body.created_notifications;
}

export async function getReminderPreferences(user: User): Promise<ReminderPreferences> {
  const body = await apiRequest<{ preferences: ReminderPreferences }>(user, { url: buildReminderPreferencesUrl(), method: "GET" }, "Failed to load reminder preferences.");
  return body.preferences;
}

export async function updateReminderPreferences(
  user: User,
  reminderPreferences: ReminderPreferences
): Promise<ReminderPreferences> {
  const body = await apiRequest<{ preferences: ReminderPreferences }>(user, {
    url: buildReminderPreferencesUrl(),
    method: "PUT",
    data: {
      dailyLoggingEnabled: reminderPreferences.daily_logging_enabled,
      dailyLoggingHour: reminderPreferences.daily_logging_hour,
      budgetAlertsEnabled: reminderPreferences.budget_alerts_enabled,
      budgetAlertThreshold: reminderPreferences.budget_alert_threshold,
      defaultCurrency: reminderPreferences.default_currency,
      defaultTimezone: reminderPreferences.default_timezone,
      displayName: reminderPreferences.display_name,
      photoUrl: reminderPreferences.photo_url
    }
  }, "Failed to update reminder preferences.");
  return body.preferences;
}

export async function getWalletReminderPreferences(walletId: string, user: User): Promise<{ budget_alerts_enabled: boolean; budget_alert_threshold: number }> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/preferences`, API_BASE_URL).toString() : `/api/wallets/${walletId}/preferences`;
  const body = await apiRequest<{ preferences: { budget_alerts_enabled: boolean; budget_alert_threshold: number } }>(user, { url: endpoint, method: "GET" }, "Failed to load wallet reminder preferences.");
  return body.preferences;
}

export async function updateWalletReminderPreferences(
  walletId: string,
  user: User,
  preferences: { budget_alerts_enabled: boolean; budget_alert_threshold: number }
): Promise<{ budget_alerts_enabled: boolean; budget_alert_threshold: number }> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/preferences`, API_BASE_URL).toString() : `/api/wallets/${walletId}/preferences`;
  const body = await apiRequest<{ preferences: { budget_alerts_enabled: boolean; budget_alert_threshold: number } }>(user, {
    url: endpoint,
    method: "PUT",
    data: {
      budgetAlertsEnabled: preferences.budget_alerts_enabled,
      budgetAlertThreshold: preferences.budget_alert_threshold
    }
  }, "Failed to update wallet reminder preferences.");
  return body.preferences;
}

export async function queryAssistant(
  messages: Array<{ role: string; content: string | null; tool_calls?: any[] }>,
  confirmedAction: { tool: string; args: any } | null,
  user: User
): Promise<{ answer: string; pendingAction?: { tool: string; args: any } }> {
  const endpoint = API_BASE_URL ? new URL("/api/assistant/query", API_BASE_URL).toString() : "/api/assistant/query";
  return apiRequest<{ answer: string; pendingAction?: { tool: string; args: any } }>(
    user,
    {
      method: "POST",
      url: endpoint,
      data: { messages, confirmedAction }
    },
    "Failed to query assistant."
  );
}

export async function queryAssistantStream(
  messages: Array<{ role: string; content: string | null; tool_calls?: any[] }>,
  confirmedAction: { tool: string; args: any } | null,
  user: User,
  onChunk: (chunk: string) => void,
  onPendingAction?: (action: { tool: string; args: any }) => void
): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/assistant/stream", API_BASE_URL).toString() : "/api/assistant/stream";
  const headers = await buildAuthorizedHeaders(user, {
    "Content-Type": "application/json"
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, confirmedAction })
  });

  if (!response.ok) {
    let errorMsg = "Failed to query assistant.";
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  if (!response.body) {
    throw new Error("ReadableStream not supported by browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const payloadStr = trimmed.slice(6).trim();
        try {
          const payload = JSON.parse(payloadStr);
          if (payload.type === "text" && payload.text) {
            onChunk(payload.text);
          } else if (payload.type === "action" && payload.pendingAction && onPendingAction) {
            onPendingAction(payload.pendingAction);
          } else if (payload.type === "error") {
            throw new Error(payload.error || "Stream failed.");
          } else if (payload.type === "done") {
            return;
          }
        } catch (e: any) {
          if (e.message && e.message !== "Unexpected end of JSON input") {
            console.warn("Error parsing stream chunk:", e);
          }
        }
      }
    }
  }
}

export interface Token {
  id: string;
  label: string;
  token_prefix: string;
  token_suffix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function listTokens(user: User): Promise<Token[]> {
  const endpoint = API_BASE_URL ? new URL("/api/tokens", API_BASE_URL).toString() : "/api/tokens";
  const body = await apiRequest<{ tokens: Token[] }>(
    user,
    {
      method: "GET",
      url: endpoint
    },
    "Failed to load access tokens."
  );
  return body.tokens;
}

export async function createToken(label: string, user: User): Promise<{ id: string; label: string; token: string; created_at: string }> {
  const endpoint = API_BASE_URL ? new URL("/api/tokens", API_BASE_URL).toString() : "/api/tokens";
  return apiRequest<{ id: string; label: string; token: string; created_at: string }>(
    user,
    {
      method: "POST",
      url: endpoint,
      data: { label }
    },
    "Failed to generate access token."
  );
}

export async function revokeToken(tokenId: string, user: User, purge = false): Promise<void> {
  const query = purge ? "?purge=true" : "";
  const endpoint = API_BASE_URL 
    ? new URL(`/api/tokens/${tokenId}${query}`, API_BASE_URL).toString() 
    : `/api/tokens/${tokenId}${query}`;
  await apiRequest<void>(
    user,
    {
      method: "DELETE",
      url: endpoint
    },
    purge ? "Failed to delete access token." : "Failed to revoke access token."
  );
}


