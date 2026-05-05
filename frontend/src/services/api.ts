import axios, { type AxiosRequestConfig } from "axios";
import type { User } from "firebase/auth";
import type {
  BillReminder,
  BillReminderRecurrence,
  BudgetForm,
  Expense,
  ExpenseForm,
  Notification,
  ReminderPreferences,
  SplitRule,
  Wallet,
  WalletDetail
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
    const body = error.response?.data as { error?: string } | null | undefined;
    const apiError = new ApiError(body?.error ?? error.message ?? fallbackMessage, status);
    apiError.retryable = status === 0 || status >= 500;
    return apiError;
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 0);
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

export function buildExpensesUrl(category: string, sortNewestFirst: boolean): string {
  const url = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL) : new URL("/api/expenses", window.location.origin);

  if (category) {
    url.searchParams.set("category", category);
  }

  if (sortNewestFirst) {
    url.searchParams.set("sort", "date_desc");
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

export async function listExpenses(user: User, category: string, sortNewestFirst: boolean): Promise<Expense[]> {
  const body = await apiRequest<{ expenses: Expense[] }>(user, { url: buildExpensesUrl(category, sortNewestFirst), method: "GET" }, "Failed to load expenses.");
  return body.expenses;
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
  payload: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> },
  user: User
): Promise<WalletDetail> {
  const body = await apiRequest<{ wallet: WalletDetail }>(user, {
    url: buildWalletsUrl(),
    method: "POST",
    data: payload
  }, "Failed to create wallet.");
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

export async function getWalletDetail(walletId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}`;
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
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> },
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
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> },
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
      budgetAlertThreshold: reminderPreferences.budget_alert_threshold
    }
  }, "Failed to update reminder preferences.");
  return body.preferences;
}
