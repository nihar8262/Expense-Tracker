import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthProvider, User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { auth, authPersistenceReady, facebookProvider, githubProvider, googleProvider, isFirebaseConfigured } from "./auth";
import { SignedInLayout } from "./layouts/SignedInLayout";
import { AlertsPage } from "./pages/AlertsPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LandingPage } from "./pages/LandingPage";
import { WalletsPage } from "./pages/WalletsPage";
import type {
  BillReminder,
  BillReminderRecurrence,
  Budget,
  BudgetForm,
  BudgetHistoryGroup,
  BudgetHistoryRange,
  BudgetSummary,
  CategoryIconId,
  CategoryOption,
  ChartDisplayType,
  ChartGranularity,
  DashboardInsight,
  DashboardStats,
  Expense,
  ExpenseForm,
  Notification,
  PendingSubmission,
  ProviderOption,
  ReminderPreferences,
  SplitRule,
  TimeRangeFilter,
  TrendDetailItem,
  TrendPoint,
  Wallet,
  WalletDetail
} from "./types";
import { ApiError } from "./types";

const providerOptions: ProviderOption[] = [
  {
    id: "google",
    label: "Continue with Google",
    blurb: "Fast sign-in with your Google account.",
    provider: googleProvider
  },
  {
    id: "github",
    label: "Continue with GitHub",
    blurb: "Great if you already live in developer tools.",
    provider: githubProvider
  },
  {
    id: "facebook",
    label: "Continue with Facebook",
    blurb: "Useful for a lighter consumer-style onboarding.",
    provider: facebookProvider
  }
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const PENDING_SUBMISSION_STORAGE_KEY = "expense-tracker.pending-submission";
const CUSTOM_CATEGORY_STORAGE_KEY_PREFIX = "expense-tracker.custom-categories";
const EXPENSES_PAGE_SIZE = 50;

const defaultCategoryOptions: CategoryOption[] = [
  { id: "groceries", label: "Groceries", icon: "cart-shopping" },
  { id: "food", label: "Food", icon: "utensils" },
  { id: "travel", label: "Travel", icon: "plane" },
  { id: "shopping", label: "Shopping", icon: "bag-shopping" },
  { id: "bills", label: "Bills", icon: "file-invoice-dollar" },
  { id: "health", label: "Health", icon: "heart-pulse" },
  { id: "entertainment", label: "Entertainment", icon: "film" },
  { id: "work", label: "Work", icon: "briefcase" },
  { id: "others", label: "Others", icon: "tag" }
];

const ICON_KEYWORD_MAP: Array<{ keywords: RegExp; icon: string }> = [
  { keywords: /grocer|supermarket|market|produce|vegetable|fruit/i, icon: "cart-shopping" },
  { keywords: /food|eat|restaur|dining|lunch|dinner|breakfast|cafe|snack|pizza|burger|meal|cook|kitchen/i, icon: "utensils" },
  { keywords: /coffee|cafe|latte|espresso|cappuccino/i, icon: "coffee" },
  { keywords: /drink|wine|beer|alcohol|bar|pub|cocktail/i, icon: "wine-glass" },
  { keywords: /travel|trip|vacation|holiday|tour|abroad/i, icon: "suitcase" },
  { keywords: /flight|airline|airfare|airport|fly/i, icon: "plane" },
  { keywords: /hotel|motel|hostel|accommodation|lodg/i, icon: "hotel" },
  { keywords: /train|rail|metro|subway/i, icon: "train" },
  { keywords: /bus|coach|transit/i, icon: "bus" },
  { keywords: /car|auto|vehicle|taxi|uber|lyft|ride/i, icon: "car" },
  { keywords: /fuel|petrol|gas pump|gasoline/i, icon: "gas-pump" },
  { keywords: /motorcycle|bike scoot/i, icon: "motorcycle" },
  { keywords: /bicycle|cycling/i, icon: "bicycle" },
  { keywords: /shop|cloth|fashion|apparel|boutique|wear|outfit/i, icon: "bag-shopping" },
  { keywords: /shirt|tshirt|dress|pants|shoes/i, icon: "shirt" },
  { keywords: /bill|utilit|electric|water|gas|internet|phone|subscription|rent|mortgage|insurance|emi/i, icon: "file-invoice-dollar" },
  { keywords: /wifi|broadband|data plan/i, icon: "wifi" },
  { keywords: /health|medical|doctor|hospital|clinic|pharmac|medicine|dental|prescription/i, icon: "heart-pulse" },
  { keywords: /gym|fitness|workout|exercise/i, icon: "dumbbell" },
  { keywords: /spa|salon|massage|beauty|cosmetic|hair|nail/i, icon: "spa" },
  { keywords: /surgery|syringe|inject|vaccine/i, icon: "syringe" },
  { keywords: /pills?|tablet|vitamin|supplement/i, icon: "pills" },
  { keywords: /stethoscope|checkup|physio/i, icon: "stethoscope" },
  { keywords: /entertain|movie|cinema|film|stream|netflix|hulu|disney|spotify/i, icon: "film" },
  { keywords: /music|concert|gig|band/i, icon: "music" },
  { keywords: /game|gaming|esport|playstation|xbox/i, icon: "gamepad" },
  { keywords: /sport|football|soccer|basketball|tennis|cricket|rugby|swim/i, icon: "basketball" },
  { keywords: /work|office|business|professional|career|salary|freelance/i, icon: "briefcase" },
  { keywords: /laptop|computer|pc|mac|desktop/i, icon: "laptop" },
  { keywords: /phone|mobile|iphone|android|smartphone/i, icon: "mobile-screen" },
  { keywords: /tv|television|monitor/i, icon: "tv" },
  { keywords: /headphone|earphone|airpod|audio/i, icon: "headphones" },
  { keywords: /camera|photo|photography/i, icon: "camera" },
  { keywords: /education|school|college|university|course|tuition|class|learn/i, icon: "graduation-cap" },
  { keywords: /book|reading|library|novel/i, icon: "book" },
  { keywords: /pet|vet|animal/i, icon: "paw" },
  { keywords: /dog/i, icon: "dog" },
  { keywords: /cat|kitten/i, icon: "cat" },
  { keywords: /gift|present|birthday|anniversary|celebration/i, icon: "gift" },
  { keywords: /charity|donation|donate|ngo|volunteer/i, icon: "hand-holding-heart" },
  { keywords: /home|house|furniture|decor|appliance|interior|flat/i, icon: "house" },
  { keywords: /couch|sofa|chair|table|desk/i, icon: "couch" },
  { keywords: /repair|fix|tool|hardware|maintenance/i, icon: "tools" },
  { keywords: /paint|repaint|wall/i, icon: "paint-roller" },
  { keywords: /hammer|construct|build/i, icon: "hammer" },
  { keywords: /child|kid|baby|infant|toddler|daycare|school fee/i, icon: "child" },
  { keywords: /tax|government|fine|penalty|fee|legal/i, icon: "landmark" },
  { keywords: /invest|stock|mutual|crypto|finance|saving|portfolio/i, icon: "chart-line" },
  { keywords: /credit card|debit card/i, icon: "credit-card" },
  { keywords: /cash|money|wallet|withdrawal/i, icon: "money-bill" },
  { keywords: /garden|plant|farm|nature|organic/i, icon: "seedling" },
  { keywords: /leaf|eco|green|environment/i, icon: "leaf" },
  { keywords: /store|shop|market|mall/i, icon: "store" },
  { keywords: /pizza/i, icon: "pizza-slice" },
  { keywords: /running|jog|marathon/i, icon: "running" },
];

function suggestFaIcon(label: string): string {
  for (const entry of ICON_KEYWORD_MAP) {
    if (entry.keywords.test(label)) {
      return entry.icon;
    }
  }
  return "tag";
}

function getTodayIsoDate(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

function createInitialFormState(baseDate = new Date()): ExpenseForm {
  return {
    amount: "",
    category: "",
    description: "",
    date: getTodayIsoDate(baseDate)
  };
}

const initialFormState: ExpenseForm = createInitialFormState();

const initialBudgetFormState: BudgetForm = {
  amount: "",
  scope: "monthly",
  category: "",
  month: getCurrentMonthValue()
};

function getCustomCategoryStorageKey(userId: string): string {
  return `${CUSTOM_CATEGORY_STORAGE_KEY_PREFIX}.${userId}`;
}

function slugifyCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-category";
}

function readCustomCategories(userId: string): CategoryOption[] {
  const storedValue = window.localStorage.getItem(getCustomCategoryStorageKey(userId));

  if (!storedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedValue) as CategoryOption[];
    return parsed.filter((item) => Boolean(item.label) && Boolean(item.icon)).map((item) => ({ ...item, isCustom: true }));
  } catch {
    window.localStorage.removeItem(getCustomCategoryStorageKey(userId));
    return [];
  }
}

function writeCustomCategories(userId: string, categories: CategoryOption[]) {
  window.localStorage.setItem(getCustomCategoryStorageKey(userId), JSON.stringify(categories));
}

function clearCustomCategories(userId: string) {
  window.localStorage.removeItem(getCustomCategoryStorageKey(userId));
}

function buildExpensesUrl(category: string, sortNewestFirst: boolean): string {
  const url = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL) : new URL("/api/expenses", window.location.origin);

  if (category) {
    url.searchParams.set("category", category);
  }

  if (sortNewestFirst) {
    url.searchParams.set("sort", "date_desc");
  }

  return url.toString();
}

function buildBudgetsUrl(): string {
  return API_BASE_URL ? new URL("/api/budgets", API_BASE_URL).toString() : "/api/budgets";
}

function buildWalletsUrl(): string {
  return API_BASE_URL ? new URL("/api/wallets", API_BASE_URL).toString() : "/api/wallets";
}

function buildNotificationsUrl(): string {
  return API_BASE_URL ? new URL("/api/notifications", API_BASE_URL).toString() : "/api/notifications";
}

function buildReminderPreferencesUrl(): string {
  return API_BASE_URL ? new URL("/api/reminder-preferences", API_BASE_URL).toString() : "/api/reminder-preferences";
}

function buildBillRemindersUrl(): string {
  return API_BASE_URL ? new URL("/api/bill-reminders", API_BASE_URL).toString() : "/api/bill-reminders";
}

function getCurrentMonthValue(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

function formatBudgetMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return month;
  }

  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function getExpenseMonth(expenseDate: string): string {
  return expenseDate.slice(0, 7);
}

function getMonthValueWithOffset(baseMonth: string, offset: number): string {
  const [year, month] = baseMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isBudgetMonthInRange(month: string, range: BudgetHistoryRange): boolean {
  if (range === "all") {
    return true;
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return false;
  }

  const budgetDate = new Date(year, monthNumber - 1, 1);
  const currentDate = new Date();
  const currentMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthDiff = (currentMonthDate.getFullYear() - budgetDate.getFullYear()) * 12 + (currentMonthDate.getMonth() - budgetDate.getMonth());

  if (monthDiff < 0) {
    return true;
  }

  if (range === "quarter") {
    return monthDiff <= 2;
  }

  if (range === "half-year") {
    return monthDiff <= 5;
  }

  return monthDiff <= 11;
}

function readPendingSubmission(): PendingSubmission | null {
  const storedValue = window.localStorage.getItem(PENDING_SUBMISSION_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as PendingSubmission;
  } catch {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return null;
  }
}

function writePendingSubmission(submission: PendingSubmission | null) {
  if (!submission) {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify(submission));
}

function formatAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to sign in.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("popup_closed_by_user") || message.includes("cancelled-popup-request")) {
    return "The sign-in window was closed before authentication completed.";
  }

  if (message.includes("popup-blocked")) {
    return "The browser blocked the sign-in popup. Allow popups for localhost and try again.";
  }

  if (message.includes("unauthorized-domain")) {
    return "This domain is not authorized in Firebase Authentication. Add your current localhost or deployed URL to Firebase authorized domains.";
  }

  if (message.includes("operation-not-allowed")) {
    return "This sign-in provider is not enabled in Firebase Authentication.";
  }

  if (message.includes("redirect_uri_mismatch") || message.includes("redirect uri")) {
    return "The OAuth redirect URL is misconfigured for this provider. Check the provider callback URL in Firebase and the provider console.";
  }

  if (message.includes("access blocked") || message.includes("cookie") || message.includes("storage")) {
    return "Browser storage or cookies blocked the sign-in flow. Try again with cookie blocking disabled for localhost.";
  }

  if (message.includes("account-exists-with-different-credential")) {
    return "An account already exists with the same email address but a different sign-in method. Sign in using the original provider (e.g. Google) linked to that email, then link additional providers from your profile.";
  }

  return error.message;
}

function formatCurrency(amount: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function isExpenseInTimeRange(expenseDate: string, timeRange: TimeRangeFilter): boolean {
  if (timeRange === "all") {
    return true;
  }

  const today = new Date();
  const parsedDate = new Date(`${expenseDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  if (timeRange === "week") {
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const offset = day === 0 ? 6 : day - 1;
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - offset);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return parsedDate >= startOfWeek && parsedDate <= endOfWeek;
  }

  if (timeRange === "month") {
    return parsedDate.getFullYear() === today.getFullYear() && parsedDate.getMonth() === today.getMonth();
  }

  return parsedDate.getFullYear() === today.getFullYear();
}

function getStartOfWeek(date: Date): Date {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const offset = day === 0 ? 6 : day - 1;
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - offset);
  return startOfWeek;
}

function getIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildTrendPoints(expenseItems: Expense[], granularity: ChartGranularity): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>();

  for (const expense of expenseItems) {
    const parsedDate = new Date(`${expense.date}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      continue;
    }

    let key = "";
    let label = "";
    let shortLabel = "";
    let order = parsedDate.getTime();

    if (granularity === "daily") {
      key = expense.date;
      label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsedDate);
      shortLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(parsedDate);
    } else if (granularity === "weekly") {
      const startOfWeek = getStartOfWeek(parsedDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      key = getIsoDateString(startOfWeek);
      label = `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(startOfWeek)} - ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(endOfWeek)}`;
      shortLabel = `Wk ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(startOfWeek)}`;
      order = startOfWeek.getTime();
    } else if (granularity === "monthly") {
      key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
      label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(parsedDate);
      shortLabel = new Intl.DateTimeFormat("en-IN", { month: "short" }).format(parsedDate);
      order = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1).getTime();
    } else if (granularity === "quarterly") {
      const quarter = Math.floor(parsedDate.getMonth() / 3) + 1;
      key = `${parsedDate.getFullYear()}-Q${quarter}`;
      label = `Q${quarter} ${parsedDate.getFullYear()}`;
      shortLabel = `Q${quarter}`;
      order = new Date(parsedDate.getFullYear(), (quarter - 1) * 3, 1).getTime();
    } else {
      key = String(parsedDate.getFullYear());
      label = String(parsedDate.getFullYear());
      shortLabel = label;
      order = new Date(parsedDate.getFullYear(), 0, 1).getTime();
    }

    const existing = buckets.get(key);
    const total = Number(expense.amount);

    if (existing) {
      existing.total += total;
      existing.count += 1;
      continue;
    }

    buckets.set(key, {
      key,
      label,
      shortLabel,
      total,
      count: 1,
      order
    });
  }

  return [...buckets.values()].sort((left, right) => left.order - right.order);
}

function buildTrendDetailLookup(expenseItems: Expense[], granularity: ChartGranularity): Record<string, TrendDetailItem[]> {
  if (granularity !== "daily" && granularity !== "weekly" && granularity !== "monthly") {
    return {};
  }

  const buckets = new Map<string, TrendDetailItem[]>();

  const sortedExpenses = [...expenseItems].sort((left, right) => {
    const byDate = right.date.localeCompare(left.date);
    return byDate !== 0 ? byDate : right.created_at.localeCompare(left.created_at);
  });

  for (const expense of sortedExpenses) {
    const parsedDate = new Date(`${expense.date}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      continue;
    }

    const key =
      granularity === "daily"
        ? expense.date
        : granularity === "weekly"
          ? getIsoDateString(getStartOfWeek(parsedDate))
        : `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;

    const existingItems = buckets.get(key) ?? [];
    existingItems.push({
      id: expense.id,
      description: expense.description,
      amount: expense.amount
    });
    buckets.set(key, existingItems);
  }

  return Object.fromEntries(buckets);
}

function resolveCategoryIcon(categoryLabel: string, categoryOptions: CategoryOption[]): CategoryIconId {
  return categoryOptions.find((option) => option.label.toLowerCase() === categoryLabel.trim().toLowerCase())?.icon ?? "other";
}

async function buildAuthorizedHeaders(user: User, extraHeaders: Record<string, string> = {}) {
  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders
  };
}

async function parseApiResponseError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(body?.error ?? fallbackMessage, response.status);
}

async function createExpense(payload: ExpenseForm, idempotencyKey: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL).toString() : "/api/expenses";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to save expense.", response.status);
  }
}

async function updateExpense(expenseId: string, payload: ExpenseForm, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/expenses/${expenseId}`, API_BASE_URL).toString() : `/api/expenses/${expenseId}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to update expense.", response.status);
  }
}

async function deleteExpense(expenseId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/expenses/${expenseId}`, API_BASE_URL).toString() : `/api/expenses/${expenseId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to delete expense.", response.status);
  }
}

async function createBudget(payload: BudgetForm, user: User): Promise<void> {
  const response = await fetch(buildBudgetsUrl(), {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    })
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to save budget.", response.status);
  }
}

async function updateBudget(budgetId: string, payload: BudgetForm, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/budgets/${budgetId}`, API_BASE_URL).toString() : `/api/budgets/${budgetId}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    })
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to update budget.", response.status);
  }
}

async function deleteBudget(budgetId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/budgets/${budgetId}`, API_BASE_URL).toString() : `/api/budgets/${budgetId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to delete budget.", response.status);
  }
}

async function deleteAccountData(user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/account", API_BASE_URL).toString() : "/api/account";
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete account.");
  }
}

async function createWallet(
  payload: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> },
  user: User
): Promise<WalletDetail> {
  const response = await fetch(buildWalletsUrl(), {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to create wallet.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function addWalletMember(walletId: string, payload: { displayName: string; email?: string }, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/members`, API_BASE_URL).toString() : `/api/wallets/${walletId}/members`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to add wallet member.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function removeWalletMember(walletId: string, memberId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL
    ? new URL(`/api/wallets/${walletId}/members/${memberId}`, API_BASE_URL).toString()
    : `/api/wallets/${walletId}/members/${memberId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to remove wallet member.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function getWalletDetail(walletId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}`;
  const response = await fetch(endpoint, {
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to load wallet.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function deleteWalletGroup(walletId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete group.");
  }
}

async function leaveWalletGroup(walletId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/leave`, API_BASE_URL).toString() : `/api/wallets/${walletId}/leave`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to exit group.");
  }
}

async function createWalletBudget(walletId: string, payload: BudgetForm, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    })
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to create wallet budget.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function updateWalletBudget(walletId: string, walletBudgetId: string, payload: BudgetForm, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets/${walletBudgetId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets/${walletBudgetId}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      amount: payload.amount,
      scope: payload.scope,
      category: payload.scope === "category" ? payload.category : undefined,
      month: payload.month
    })
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to update wallet budget.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function deleteWalletBudget(walletId: string, walletBudgetId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/budgets/${walletBudgetId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/budgets/${walletBudgetId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete wallet budget.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function createSharedWalletExpense(
  walletId: string,
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to create shared expense.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function updateSharedWalletExpense(
  walletId: string,
  walletExpenseId: string,
  payload: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses/${walletExpenseId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses/${walletExpenseId}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to update shared expense.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function deleteSharedWalletExpense(walletId: string, walletExpenseId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/expenses/${walletExpenseId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/expenses/${walletExpenseId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete shared expense.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function createWalletSettlement(
  walletId: string,
  payload: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to record settlement.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function updateWalletSettlementEntry(
  walletId: string,
  settlementId: string,
  payload: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string },
  user: User
): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements/${settlementId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements/${settlementId}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to update settlement.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function deleteWalletSettlementEntry(walletId: string, settlementId: string, user: User): Promise<WalletDetail> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallets/${walletId}/settlements/${settlementId}`, API_BASE_URL).toString() : `/api/wallets/${walletId}/settlements/${settlementId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete settlement.");
  }

  const body = (await response.json()) as { wallet: WalletDetail };
  return body.wallet;
}

async function listBillReminders(user: User): Promise<BillReminder[]> {
  const response = await fetch(buildBillRemindersUrl(), {
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to load bill reminders.");
  }

  const body = (await response.json()) as { billReminders: BillReminder[] };
  return body.billReminders;
}

async function saveBillReminder(
  payload: { title: string; amount: string; category: string; dueDate: string; recurrence: BillReminderRecurrence; intervalCount: number; reminderDaysBefore: number; isActive: boolean },
  user: User,
  billReminderId?: string
): Promise<BillReminder> {
  const endpoint = billReminderId
    ? API_BASE_URL ? new URL(`/api/bill-reminders/${billReminderId}`, API_BASE_URL).toString() : `/api/bill-reminders/${billReminderId}`
    : buildBillRemindersUrl();
  const response = await fetch(endpoint, {
    method: billReminderId ? "PUT" : "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, billReminderId ? "Failed to update bill reminder." : "Failed to create bill reminder.");
  }

  const body = (await response.json()) as { billReminder: BillReminder };
  return body.billReminder;
}

async function deleteBillReminderEntry(billReminderId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/bill-reminders/${billReminderId}`, API_BASE_URL).toString() : `/api/bill-reminders/${billReminderId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete bill reminder.");
  }
}

async function respondToWalletInvite(walletMemberId: string, action: "accept" | "decline", user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/wallet-invites/${walletMemberId}/respond`, API_BASE_URL).toString() : `/api/wallet-invites/${walletMemberId}/respond`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ action })
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to respond to wallet invite.");
  }
}

async function deleteNotification(notificationId: string, user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL(`/api/notifications/${notificationId}`, API_BASE_URL).toString() : `/api/notifications/${notificationId}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to delete notification.");
  }
}

async function runNotificationChecks(user: User): Promise<Notification[]> {
  const endpoint = API_BASE_URL ? new URL("/api/notifications/run-checks", API_BASE_URL).toString() : "/api/notifications/run-checks";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    throw await parseApiResponseError(response, "Failed to run reminder checks.");
  }

  const body = (await response.json()) as { created_notifications: Notification[] };
  return body.created_notifications;
}

export default function App() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ExpenseForm>(initialFormState);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(initialBudgetFormState);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletDetail | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [billReminders, setBillReminders] = useState<BillReminder[]>([]);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreferences | null>(null);
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRangeFilter>("all");
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("monthly");
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>("area");
  const [budgetHistoryRange, setBudgetHistoryRange] = useState<BudgetHistoryRange>("half-year");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [currentExpensesPage, setCurrentExpensesPage] = useState(1);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isBudgetHistoryOpen, setIsBudgetHistoryOpen] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deletingBudgetIds, setDeletingBudgetIds] = useState<string[]>([]);
  const [deletingExpenseIds, setDeletingExpenseIds] = useState<string[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBudgetSubmitting, setIsBudgetSubmitting] = useState(false);
  const [isWalletSubmitting, setIsWalletSubmitting] = useState(false);
  const [walletSubmittingAction, setWalletSubmittingAction] = useState("");
  const [dashboardViewMode, setDashboardViewMode] = useState<"personal" | "wallet">("personal");
  const [dashboardWalletId, setDashboardWalletId] = useState<string | null>(null);
  const [dashboardWallet, setDashboardWallet] = useState<WalletDetail | null>(null);
  const [isSavingReminderPreferences, setIsSavingReminderPreferences] = useState(false);
  const [isSavingBillReminder, setIsSavingBillReminder] = useState(false);
  const [isRunningNotificationChecks, setIsRunningNotificationChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [budgetErrorMessage, setBudgetErrorMessage] = useState("");
  const [budgetStatusMessage, setBudgetStatusMessage] = useState("");
  const [walletErrorMessage, setWalletErrorMessage] = useState("");
  const [walletStatusMessage, setWalletStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(() => [...new Set(expenses.map((expense) => expense.category))].sort((left, right) => left.localeCompare(right)), [expenses]);

  const availableCategoryOptions = useMemo(() => {
    const byLabel = new Map<string, CategoryOption>();
    const otherCategory = defaultCategoryOptions.find((category) => category.id === "others") ?? null;

    for (const category of defaultCategoryOptions) {
      if (category.id === "others") {
        continue;
      }

      byLabel.set(category.label.toLowerCase(), category);
    }

    for (const category of customCategories) {
      byLabel.set(category.label.toLowerCase(), category);
    }

    for (const category of categories) {
      const key = category.toLowerCase();

      if (!byLabel.has(key)) {
        byLabel.set(key, {
          id: slugifyCategoryLabel(category),
          label: category,
          icon: "other"
        });
      }
    }

    const orderedCategories = [...byLabel.values()];

    if (otherCategory) {
      orderedCategories.push(otherCategory);
    }

    return orderedCategories;
  }, [categories, customCategories]);

  const budgetCategoryOptions = useMemo(() => availableCategoryOptions.filter((option) => option.id !== "others"), [availableCategoryOptions]);

  const selectedCategoryOption = useMemo(() => availableCategoryOptions.find((option) => option.label.toLowerCase() === form.category.trim().toLowerCase()) ?? null, [availableCategoryOptions, form.category]);
  const isOtherCategorySelected = selectedCategoryOption?.id === "others";

  const dashboardExpenses = useMemo<Expense[]>(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet) {
      return expenses;
    }

    return dashboardWallet.expenses.map((walletExpense) => ({
      id: walletExpense.id,
      amount: walletExpense.amount,
      category: walletExpense.category,
      description: walletExpense.description,
      date: walletExpense.date,
      created_at: walletExpense.created_at
    }));
  }, [dashboardViewMode, dashboardWallet, expenses]);

  const dashboardCategories = useMemo(
    () => [...new Set(dashboardExpenses.map((e) => e.category))].sort((l, r) => l.localeCompare(r)),
    [dashboardExpenses]
  );

  const visibleExpenses = useMemo(() => expenses.filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange)), [expenses, selectedTimeRange]);
  const dashboardVisibleExpenses = useMemo(
    () => dashboardExpenses.filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange)),
    [dashboardExpenses, selectedTimeRange]
  );
  const totalExpensePages = Math.max(1, Math.ceil(visibleExpenses.length / EXPENSES_PAGE_SIZE));
  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentExpensesPage - 1) * EXPENSES_PAGE_SIZE;
    return visibleExpenses.slice(startIndex, startIndex + EXPENSES_PAGE_SIZE);
  }, [currentExpensesPage, visibleExpenses]);
  const allFilteredExpenseIds = useMemo(() => visibleExpenses.map((expense) => expense.id), [visibleExpenses]);
  const allVisibleExpenseIds = useMemo(() => paginatedExpenses.map((expense) => expense.id), [paginatedExpenses]);
  const selectedVisibleExpenseIds = useMemo(() => allVisibleExpenseIds.filter((expenseId) => selectedExpenseIds.includes(expenseId)), [allVisibleExpenseIds, selectedExpenseIds]);
  const areAllVisibleExpensesSelected = allVisibleExpenseIds.length > 0 && selectedVisibleExpenseIds.length === allVisibleExpenseIds.length;

  const spendTrend = useMemo(() => buildTrendPoints(dashboardVisibleExpenses, chartGranularity), [dashboardVisibleExpenses, chartGranularity]);
  const trendDetailLookup = useMemo(() => buildTrendDetailLookup(dashboardVisibleExpenses, chartGranularity), [dashboardVisibleExpenses, chartGranularity]);

  const chartSummary = useMemo(() => {
    const peakValue = spendTrend.reduce((currentMax, point) => Math.max(currentMax, point.total), 0);
    const chartWidth = 100;
    const chartHeight = 100;
    const horizontalStep = spendTrend.length > 1 ? chartWidth / (spendTrend.length - 1) : 0;

    const points = spendTrend.map((point, index) => {
      const x = spendTrend.length === 1 ? chartWidth / 2 : index * horizontalStep;
      const y = peakValue === 0 ? chartHeight : chartHeight - (point.total / peakValue) * chartHeight;

      return {
        ...point,
        x,
        y
      };
    });

    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    const areaPath = points.length > 0 ? `${linePath} L ${points[points.length - 1]?.x.toFixed(2)} ${chartHeight} L ${points[0]?.x.toFixed(2)} ${chartHeight} Z` : "";

    return {
      points,
      peakValue,
      linePath,
      areaPath
    };
  }, [spendTrend]);

  const total = useMemo(() => formatCurrency(dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0).toFixed(2)), [dashboardVisibleExpenses]);

  const dashboardStats = useMemo<DashboardStats>(() => {
    const expenseCount = dashboardVisibleExpenses.length;
    const rawTotal = dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const average = expenseCount > 0 ? rawTotal / expenseCount : 0;

    const categoryTotals = dashboardVisibleExpenses.reduce<Record<string, number>>((accumulator, expense) => {
      accumulator[expense.category] = (accumulator[expense.category] ?? 0) + Number(expense.amount);
      return accumulator;
    }, {});

    const categoryBreakdown = Object.entries(categoryTotals)
      .sort((left, right) => right[1] - left[1])
      .map(([category, amount]) => ({
        category,
        amount,
        formattedAmount: formatCurrency(amount.toFixed(2)),
        share: rawTotal > 0 ? (amount / rawTotal) * 100 : 0
      }));

    const latestExpense = [...dashboardVisibleExpenses].sort((left, right) => {
      const byDate = right.date.localeCompare(left.date);
      return byDate !== 0 ? byDate : right.created_at.localeCompare(left.created_at);
    })[0] ?? null;

    return {
      expenseCount,
      average: formatCurrency(average.toFixed(2)),
      topCategory: categoryBreakdown[0] ?? null,
      latestExpense,
      categoryBreakdown
    };
  }, [dashboardVisibleExpenses]);

  const budgetSummaries = useMemo<BudgetSummary[]>(() => {
    return budgets
      .map((budget) => {
        const spent = expenses
          .filter((expense) => getExpenseMonth(expense.date) === budget.month)
          .filter((expense) => (budget.scope === "category" ? expense.category === budget.category : true))
          .reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalBudgetAmount = Number(budget.amount);
        const remaining = totalBudgetAmount - spent;

        return {
          ...budget,
          spent,
          remaining,
          formattedAmount: formatCurrency(budget.amount),
          formattedSpent: formatCurrency(spent.toFixed(2)),
          formattedRemaining: formatCurrency(remaining.toFixed(2)),
          isOverspent: remaining < 0
        };
      })
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);

        if (byMonth !== 0) {
          return byMonth;
        }

        if (left.scope !== right.scope) {
          return left.scope === "monthly" ? -1 : 1;
        }

        return (left.category ?? "").localeCompare(right.category ?? "");
      });
  }, [budgets, expenses]);

  const currentBudgetMonth = getCurrentMonthValue();

  const dashboardBudgetSummaries = useMemo<BudgetSummary[]>(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet) {
      return budgetSummaries;
    }

    const walletExpensesAsBudgetExpenses = dashboardWallet.expenses.map((we) => ({
      amount: we.amount,
      category: we.category,
      date: we.date
    }));

    return dashboardWallet.budgets
      .map((budget) => {
        const spent = walletExpensesAsBudgetExpenses
          .filter((expense) => getExpenseMonth(expense.date) === budget.month)
          .filter((expense) => (budget.scope === "category" ? expense.category === budget.category : true))
          .reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalBudgetAmount = Number(budget.amount);
        const remaining = totalBudgetAmount - spent;

        return {
          ...budget,
          spent,
          remaining,
          formattedAmount: formatCurrency(budget.amount),
          formattedSpent: formatCurrency(spent.toFixed(2)),
          formattedRemaining: formatCurrency(remaining.toFixed(2)),
          isOverspent: remaining < 0
        };
      })
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);
        if (byMonth !== 0) return byMonth;
        if (left.scope !== right.scope) return left.scope === "monthly" ? -1 : 1;
        return (left.category ?? "").localeCompare(right.category ?? "");
      });
  }, [dashboardViewMode, dashboardWallet, budgetSummaries]);

  const dashboardCurrentMonthBudgetSummaries = useMemo(() => dashboardBudgetSummaries.filter((budget) => budget.month === currentBudgetMonth), [dashboardBudgetSummaries, currentBudgetMonth]);

  const dashboardCurrentMonthBudgetOverview = useMemo(() => {
    const totalBudgetAmount = dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + Number(budget.amount), 0);
    const totalSpentAmount = dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + budget.spent, 0);
    const totalRemainingAmount = totalBudgetAmount - totalSpentAmount;

    return {
      totalBudget: formatCurrency(totalBudgetAmount.toFixed(2)),
      totalSpent: formatCurrency(totalSpentAmount.toFixed(2)),
      totalRemaining: formatCurrency(totalRemainingAmount.toFixed(2)),
      isOverspent: totalRemainingAmount < 0
    };
  }, [dashboardCurrentMonthBudgetSummaries]);

  const dashboardInsights = useMemo<DashboardInsight[]>(() => {
    const insights: DashboardInsight[] = [];
    const previousMonth = getMonthValueWithOffset(currentBudgetMonth, -1);
    const filteredExpenses = selectedCategory ? dashboardExpenses.filter((expense) => expense.category === selectedCategory) : dashboardExpenses;
    const currentMonthSpend = filteredExpenses.filter((expense) => getExpenseMonth(expense.date) === currentBudgetMonth).reduce((sum, expense) => sum + Number(expense.amount), 0);
    const previousMonthSpend = filteredExpenses.filter((expense) => getExpenseMonth(expense.date) === previousMonth).reduce((sum, expense) => sum + Number(expense.amount), 0);

    if (currentMonthSpend > 0 && previousMonthSpend > 0) {
      const percentageDelta = ((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100;
      insights.push({
        id: "month-change",
        title: percentageDelta >= 0 ? `Up ${Math.abs(percentageDelta).toFixed(0)}% from last month` : `Down ${Math.abs(percentageDelta).toFixed(0)}% from last month`,
        body: `${formatCurrency(currentMonthSpend.toFixed(2))} this month versus ${formatCurrency(previousMonthSpend.toFixed(2))} last month.`,
        tone: Math.abs(percentageDelta) >= 20 ? "warning" : "neutral"
      });
    }

    if (dashboardCurrentMonthBudgetSummaries.length > 0) {
      const totalBudgetAmount = dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + Number(budget.amount), 0);
      const remainingBudgetAmount = totalBudgetAmount - dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + budget.spent, 0);
      const remainingShare = totalBudgetAmount > 0 ? remainingBudgetAmount / totalBudgetAmount : 0;

      insights.push({
        id: "budget-status",
        title: remainingShare <= 0.2 ? "You are close to your budget" : remainingBudgetAmount < 0 ? "You are over budget" : "Your budget still has room",
        body: `${formatCurrency(Math.abs(remainingBudgetAmount).toFixed(2))} ${remainingBudgetAmount < 0 ? "over" : "remaining"} across this month's budgets.`,
        tone: remainingBudgetAmount < 0 || remainingShare <= 0.2 ? "warning" : "positive"
      });
    }

    if (dashboardStats.topCategory) {
      insights.push({
        id: "top-category",
        title: `${dashboardStats.topCategory.category} dominates spending`,
        body: `${dashboardStats.topCategory.formattedAmount} accounts for ${dashboardStats.topCategory.share.toFixed(0)}% of the current view.`,
        tone: "neutral"
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "starter",
        title: "Add a few more expenses to unlock insights",
        body: "Once you have at least two periods of activity, the dashboard will start comparing momentum and budget pressure.",
        tone: "neutral"
      });
    }

    return insights.slice(0, 3);
  }, [currentBudgetMonth, dashboardCurrentMonthBudgetSummaries, dashboardStats, dashboardExpenses, selectedCategory]);

  const dashboardBudgetHistoryGroups = useMemo<BudgetHistoryGroup[]>(() => {
    const filteredBudgets = dashboardBudgetSummaries.filter((budget) => isBudgetMonthInRange(budget.month, budgetHistoryRange));
    const groupedBudgets = new Map<string, BudgetSummary[]>();

    for (const budget of filteredBudgets) {
      const existingItems = groupedBudgets.get(budget.month) ?? [];
      existingItems.push(budget);
      groupedBudgets.set(budget.month, existingItems);
    }

    return [...groupedBudgets.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([month, items]) => ({
        month,
        label: formatBudgetMonth(month),
        items
      }));
  }, [budgetHistoryRange, dashboardBudgetSummaries]);

  const unreadNotificationCount = useMemo(() => notifications.filter((notification) => notification.status === "unread").length, [notifications]);

  async function loadExpenses(user: User, activeCategory = selectedCategory, activeSort = sortNewestFirst) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(buildExpensesUrl(activeCategory, activeSort), {
        headers: await buildAuthorizedHeaders(user)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load expenses.");
      }

      const body = (await response.json()) as { expenses: Expense[] };
      setExpenses(body.expenses);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load expenses.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBudgets(user: User) {
    setIsBudgetLoading(true);
    setBudgetErrorMessage("");

    try {
      const response = await fetch(buildBudgetsUrl(), {
        headers: await buildAuthorizedHeaders(user)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load budgets.");
      }

      const body = (await response.json()) as { budgets: Budget[] };
      setBudgets(body.budgets);
    } catch (error) {
      setBudgetErrorMessage(error instanceof Error ? error.message : "Failed to load budgets.");
    } finally {
      setIsBudgetLoading(false);
    }
  }

  async function loadWallets(user: User) {
    setIsWalletLoading(true);
    setWalletErrorMessage("");

    try {
      const response = await fetch(buildWalletsUrl(), {
        headers: await buildAuthorizedHeaders(user)
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to load wallets.");
      }

      const body = (await response.json()) as { wallets: Wallet[] };
      setWallets(body.wallets);
      setSelectedWalletId((current) => {
        if (current && body.wallets.some((wallet) => wallet.id === current)) {
          return current;
        }

        return body.wallets[0]?.id ?? null;
      });
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to load wallets.");
    } finally {
      setIsWalletLoading(false);
    }
  }

  async function loadSelectedWallet(user: User, walletId: string) {
    setIsWalletLoading(true);
    setWalletErrorMessage("");

    try {
      const wallet = await getWalletDetail(walletId, user);
      setSelectedWallet(wallet);
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to load wallet.");
    } finally {
      setIsWalletLoading(false);
    }
  }

  async function loadNotifications(user: User) {
    try {
      const response = await fetch(buildNotificationsUrl(), {
        headers: await buildAuthorizedHeaders(user)
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to load notifications.");
      }

      const body = (await response.json()) as { notifications: Notification[] };
      setNotifications(body.notifications);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to load notifications.");
    }
  }

  async function runChecksAndReloadNotifications(user: User) {
    try {
      await runNotificationChecks(user);
    } catch {
      // silently ignore check errors; still reload existing notifications
    }
    await loadNotifications(user);
  }

  async function loadReminderPreferences(user: User) {
    try {
      const response = await fetch(buildReminderPreferencesUrl(), {
        headers: await buildAuthorizedHeaders(user)
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to load reminder preferences.");
      }

      const body = (await response.json()) as { preferences: ReminderPreferences };
      setReminderPreferences(body.preferences);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to load reminder preferences.");
    }
  }

  async function loadBillReminders(user: User) {
    try {
      const entries = await listBillReminders(user);
      setBillReminders(entries);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to load bill reminders.");
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      setAuthMessage("Firebase web auth is not configured yet. Add the Firebase env values to enable sign-in.");
      return;
    }

    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      setIsProfileMenuOpen(false);
      setIsNotificationPanelOpen(false);
      setIsDeleteAccountModalOpen(false);

      if (!user) {
        setExpenses([]);
        setBudgets([]);
        setWallets([]);
        setSelectedWalletId(null);
        setSelectedWallet(null);
        setNotifications([]);
        setBillReminders([]);
        setReminderPreferences(null);
        setCustomCategories([]);
        setCustomCategoryName("");
        setForm(initialFormState);
        setBudgetForm(initialBudgetFormState);
        setSelectedCategory("");
        setCurrentExpensesPage(1);
        setSelectedExpenseIds([]);
        setEditingExpenseId(null);
        setEditingBudgetId(null);
        setIsBudgetHistoryOpen(false);
        return;
      }

      setAuthMessage("");
      setCustomCategories(readCustomCategories(user.uid));
    });
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!currentUser) {
      setIsLoading(false);
      setExpenses([]);
      return;
    }

    void loadExpenses(currentUser, selectedCategory, sortNewestFirst);
  }, [authLoading, currentUser, selectedCategory, sortNewestFirst]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!currentUser) {
      setIsBudgetLoading(false);
      setBudgets([]);
      return;
    }

    void loadBudgets(currentUser);
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!currentUser) {
      setIsWalletLoading(false);
      setWallets([]);
      setSelectedWalletId(null);
      setSelectedWallet(null);
      setNotifications([]);
      setBillReminders([]);
      setReminderPreferences(null);
      return;
    }

    void loadWallets(currentUser);
    void runChecksAndReloadNotifications(currentUser);
    void loadBillReminders(currentUser);
    void loadReminderPreferences(currentUser);
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedWalletId) {
      setSelectedWallet(null);
      return;
    }

    void loadSelectedWallet(currentUser, selectedWalletId);
  }, [currentUser, selectedWalletId]);

  useEffect(() => {
    if (!currentUser || !dashboardWalletId || dashboardViewMode !== "wallet") {
      setDashboardWallet(null);
      return;
    }

    if (selectedWallet && selectedWallet.wallet.id === dashboardWalletId) {
      setDashboardWallet(selectedWallet);
      return;
    }

    getWalletDetail(dashboardWalletId, currentUser).then(setDashboardWallet).catch(() => setDashboardWallet(null));
  }, [currentUser, dashboardViewMode, dashboardWalletId, selectedWallet]);

  useEffect(() => {
    setCurrentExpensesPage(1);
  }, [selectedCategory, selectedTimeRange, sortNewestFirst]);

  useEffect(() => {
    if (currentExpensesPage > totalExpensePages) {
      setCurrentExpensesPage(totalExpensePages);
    }
  }, [currentExpensesPage, totalExpensePages]);

  useEffect(() => {
    setSelectedExpenseIds((current) => current.filter((expenseId) => allFilteredExpenseIds.includes(expenseId)));
  }, [allFilteredExpenseIds]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const pendingSubmission = readPendingSubmission();

    if (!pendingSubmission || pendingSubmission.userId !== currentUser.uid) {
      return;
    }

    setStatusMessage("Retrying your last submission after refresh.");
    setIsSubmitting(true);

    void createExpense(pendingSubmission.payload, pendingSubmission.idempotencyKey, currentUser)
      .then(async () => {
        writePendingSubmission(null);
        setForm(initialFormState);
        setStatusMessage("Expense saved.");
        await loadExpenses(currentUser);
      })
      .catch((error) => {
        if (error instanceof ApiError && !error.retryable) {
          writePendingSubmission(null);
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to resume submission.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [currentUser]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }

      if (!notificationPanelRef.current?.contains(event.target as Node)) {
        setIsNotificationPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function handleSignIn(provider: AuthProvider) {
    if (!auth) {
      return;
    }

    setAuthMessage("");

    try {
      await authPersistenceReady;

      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Firebase popup sign-in failed.", error);
      setAuthMessage(formatAuthError(error));
    }
  }

  async function handleSignOut() {
    if (!auth) {
      return;
    }

    await signOut(auth);
    writePendingSubmission(null);
    setStatusMessage("");
    setErrorMessage("");
    setBudgetStatusMessage("");
    setBudgetErrorMessage("");
    setIsProfileMenuOpen(false);
    setIsNotificationPanelOpen(false);
    setIsBudgetHistoryOpen(false);
    setSelectedExpenseIds([]);
    setEditingExpenseId(null);
    setEditingBudgetId(null);
  }

  function handleEditStart(expense: Expense) {
    navigate("/expenses");
    setEditingExpenseId(expense.id);
    setForm({
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      date: expense.date
    });
    setStatusMessage("");
    setErrorMessage("");
  }

  function handleEditCancel() {
    setEditingExpenseId(null);
    setForm(initialFormState);
    setStatusMessage("");
    setErrorMessage("");
  }

  async function removeExpenses(expenseIds: string[]) {
    if (!currentUser) {
      return { deletedCount: 0, failedCount: expenseIds.length };
    }

    const uniqueExpenseIds = [...new Set(expenseIds)];
    setDeletingExpenseIds((current) => [...new Set([...current, ...uniqueExpenseIds])]);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const deletionResults = await Promise.allSettled(uniqueExpenseIds.map((expenseId) => deleteExpense(expenseId, currentUser)));
      const deletedExpenseIds = uniqueExpenseIds.filter((_, index) => deletionResults[index]?.status === "fulfilled");
      const failedCount = uniqueExpenseIds.length - deletedExpenseIds.length;

      if (deletedExpenseIds.includes(editingExpenseId ?? "")) {
        setEditingExpenseId(null);
        setForm(initialFormState);
      }

      if (deletedExpenseIds.length > 0) {
        setSelectedExpenseIds((current) => current.filter((expenseId) => !deletedExpenseIds.includes(expenseId)));
        await loadExpenses(currentUser, selectedCategory, sortNewestFirst);
      }

      return {
        deletedCount: deletedExpenseIds.length,
        failedCount
      };
    } finally {
      setDeletingExpenseIds((current) => current.filter((expenseId) => !uniqueExpenseIds.includes(expenseId)));
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!currentUser) {
      return;
    }

    const confirmed = window.confirm("Delete this expense permanently?");

    if (!confirmed) {
      return;
    }

    const result = await removeExpenses([expenseId]);

    if (result.deletedCount === 1 && result.failedCount === 0) {
      setStatusMessage("Expense deleted.");
      return;
    }

    if (result.deletedCount > 0) {
      setStatusMessage(`${result.deletedCount} expenses deleted.`);
    }

    if (result.failedCount > 0) {
      setErrorMessage(result.deletedCount > 0 ? `${result.failedCount} selected expenses could not be deleted.` : "Failed to delete expense.");
    }
  }

  async function handleDeleteSelectedExpenses() {
    if (selectedVisibleExpenseIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedVisibleExpenseIds.length} selected expenses permanently?`);

    if (!confirmed) {
      return;
    }

    const result = await removeExpenses(selectedVisibleExpenseIds);

    if (result.deletedCount > 0) {
      setStatusMessage(`${result.deletedCount} ${result.deletedCount === 1 ? "expense" : "expenses"} deleted.`);
    }

    if (result.failedCount > 0) {
      setErrorMessage(result.deletedCount > 0 ? `${result.failedCount} selected expenses could not be deleted.` : "Failed to delete selected expenses.");
    }
  }

  function handleToggleExpenseSelection(expenseId: string) {
    setSelectedExpenseIds((current) => (current.includes(expenseId) ? current.filter((id) => id !== expenseId) : [...current, expenseId]));
  }

  function handleToggleSelectAllVisibleExpenses() {
    setSelectedExpenseIds((current) => {
      if (areAllVisibleExpensesSelected) {
        return current.filter((expenseId) => !allVisibleExpenseIds.includes(expenseId));
      }

      return [...new Set([...current, ...allVisibleExpenseIds])];
    });
  }

  async function handleDeleteAccount() {
    if (!currentUser) {
      return;
    }

    setIsDeletingAccount(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await deleteAccountData(currentUser);
      clearCustomCategories(currentUser.uid);
      writePendingSubmission(null);
      setIsProfileMenuOpen(false);
      setIsNotificationPanelOpen(false);
      setIsDeleteAccountModalOpen(false);
      setExpenses([]);
      setBudgets([]);
      setWallets([]);
      setSelectedWalletId(null);
      setSelectedWallet(null);
      setNotifications([]);
      setBillReminders([]);
      setReminderPreferences(null);
      setCustomCategories([]);
      setForm(initialFormState);
      setBudgetForm(initialBudgetFormState);
      setSelectedCategory("");
      setSelectedExpenseIds([]);
      setEditingExpenseId(null);
      setEditingBudgetId(null);
      setIsBudgetHistoryOpen(false);
      if (auth) {
        await signOut(auth);
      }
      setCurrentUser(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete your account.";
      if (message.includes("requires-recent-login")) {
        setErrorMessage("For security, please sign in again and then retry deleting your account.");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  }

  function startWalletSubmit(action: string) {
    setIsWalletSubmitting(true);
    setWalletSubmittingAction(action);
    setWalletErrorMessage("");
    setWalletStatusMessage("");
  }

  function endWalletSubmit() {
    setIsWalletSubmitting(false);
    setWalletSubmittingAction("");
  }

  async function handleCreateWallet(input: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to create a shared wallet.");
      return false;
    }

    startWalletSubmit("create-wallet");

    try {
      const wallet = await createWallet(input, currentUser);
      await loadWallets(currentUser);
      setSelectedWalletId(wallet.wallet.id);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Wallet created.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to create wallet.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleAddWalletMember(inputWalletId: string, input: { displayName: string; email?: string }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to add a wallet member.");
      return false;
    }

    startWalletSubmit("member");

    try {
      const wallet = await addWalletMember(inputWalletId, input, currentUser);
      await loadWallets(currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Wallet member added.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to add wallet member.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleRemoveWalletMember(inputWalletId: string, memberId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to remove a wallet member.");
      return false;
    }

    startWalletSubmit("member");

    try {
      const wallet = await removeWalletMember(inputWalletId, memberId, currentUser);
      await loadWallets(currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Member removed.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to remove wallet member.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleCreateWalletBudget(inputWalletId: string, input: BudgetForm) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to create a group budget.");
      return false;
    }

    startWalletSubmit("budget");

    try {
      const wallet = await createWalletBudget(inputWalletId, input, currentUser);
      setSelectedWallet(wallet);
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to create wallet budget.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleUpdateWalletBudget(inputWalletId: string, walletBudgetId: string, input: BudgetForm) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to update a group budget.");
      return false;
    }

    startWalletSubmit("budget");

    try {
      const wallet = await updateWalletBudget(inputWalletId, walletBudgetId, input, currentUser);
      setSelectedWallet(wallet);
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to update wallet budget.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleDeleteWalletBudget(inputWalletId: string, walletBudgetId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to delete a group budget.");
      return false;
    }

    startWalletSubmit("budget");

    try {
      const wallet = await deleteWalletBudget(inputWalletId, walletBudgetId, currentUser);
      setSelectedWallet(wallet);
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to delete wallet budget.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleDeleteWallet(inputWalletId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to delete this group.");
      return false;
    }

    startWalletSubmit("delete-wallet");

    try {
      await deleteWalletGroup(inputWalletId, currentUser);
      setSelectedWallet(null);
      setSelectedWalletId(null);
      await loadWallets(currentUser);
      await loadNotifications(currentUser);
      setWalletStatusMessage("Group deleted.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to delete group.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleLeaveWallet(inputWalletId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to exit this group.");
      return false;
    }

    startWalletSubmit("leave-wallet");

    try {
      await leaveWalletGroup(inputWalletId, currentUser);
      setSelectedWallet(null);
      setSelectedWalletId(null);
      await loadWallets(currentUser);
      await loadNotifications(currentUser);
      setWalletStatusMessage("You exited the group.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to exit group.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleCreateWalletExpense(inputWalletId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to add a shared expense.");
      return false;
    }

    startWalletSubmit("expense");

    try {
      const wallet = await createSharedWalletExpense(inputWalletId, input, currentUser);
      await loadWallets(currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Shared expense added.");
      void runChecksAndReloadNotifications(currentUser);
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to create shared expense.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleUpdateWalletExpense(inputWalletId: string, walletExpenseId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to update a shared expense.");
      return false;
    }

    startWalletSubmit("expense");

    try {
      const wallet = await updateSharedWalletExpense(inputWalletId, walletExpenseId, input, currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Shared expense updated.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to update shared expense.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleDeleteWalletExpense(inputWalletId: string, walletExpenseId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to delete a shared expense.");
      return false;
    }

    startWalletSubmit("expense");

    try {
      const wallet = await deleteSharedWalletExpense(inputWalletId, walletExpenseId, currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Shared expense deleted.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to delete shared expense.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleCreateWalletSettlement(inputWalletId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to record a settlement.");
      return false;
    }

    startWalletSubmit("settlement");

    try {
      const wallet = await createWalletSettlement(inputWalletId, input, currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Settlement recorded.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to record settlement.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleUpdateWalletSettlement(inputWalletId: string, settlementId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to update a settlement.");
      return false;
    }

    startWalletSubmit("settlement");

    try {
      const wallet = await updateWalletSettlementEntry(inputWalletId, settlementId, input, currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Settlement updated.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to update settlement.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleDeleteWalletSettlement(inputWalletId: string, settlementId: string) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to delete a settlement.");
      return false;
    }

    startWalletSubmit("settlement");

    try {
      const wallet = await deleteWalletSettlementEntry(inputWalletId, settlementId, currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Settlement deleted.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to delete settlement.");
      return false;
    } finally {
      endWalletSubmit();
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    if (!currentUser) {
      return;
    }

    const endpoint = API_BASE_URL ? new URL(`/api/notifications/${notificationId}/read`, API_BASE_URL).toString() : `/api/notifications/${notificationId}/read`;

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: await buildAuthorizedHeaders(currentUser)
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to update notification.");
      }

      const body = (await response.json()) as { notification: Notification };
      setNotifications((current) => current.map((notification) => (notification.id === notificationId ? body.notification : notification)));
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to update notification.");
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!currentUser) {
      return;
    }

    const endpoint = API_BASE_URL ? new URL("/api/notifications/read-all", API_BASE_URL).toString() : "/api/notifications/read-all";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await buildAuthorizedHeaders(currentUser)
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to update notifications.");
      }

      setNotifications((current) => current.map((notification) => ({ ...notification, status: "read" })));
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to update notifications.");
    }
  }

  async function handleDeleteNotification(notificationId: string) {
    if (!currentUser) {
      return false;
    }

    try {
      await deleteNotification(notificationId, currentUser);
      setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
      return true;
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to delete notification.");
      return false;
    }
  }

  async function handleRespondToWalletInvite(walletMemberId: string, action: "accept" | "decline") {
    if (!currentUser) {
      return false;
    }

    try {
      await respondToWalletInvite(walletMemberId, action, currentUser);
      await loadNotifications(currentUser);
      await loadWallets(currentUser);
      setAuthMessage(action === "accept" ? "Invite accepted — you have been added to the group." : "Invite declined.");
      return true;
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to respond to wallet invite.");
      return false;
    }
  }

  async function handleRunNotificationChecks() {
    if (!currentUser) {
      return;
    }

    setIsRunningNotificationChecks(true);

    try {
      await runNotificationChecks(currentUser);
      await loadNotifications(currentUser);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to run reminder checks.");
    } finally {
      setIsRunningNotificationChecks(false);
    }
  }

  function handleReminderPreferencesChange(field: "daily_logging_enabled" | "daily_logging_hour" | "budget_alerts_enabled" | "budget_alert_threshold", value: boolean | number) {
    setReminderPreferences((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value
      };
    });
  }

  async function handleSaveReminderPreferences() {
    if (!currentUser || !reminderPreferences) {
      return;
    }

    setIsSavingReminderPreferences(true);

    try {
      const response = await fetch(buildReminderPreferencesUrl(), {
        method: "PUT",
        headers: await buildAuthorizedHeaders(currentUser, {
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          dailyLoggingEnabled: reminderPreferences.daily_logging_enabled,
          dailyLoggingHour: reminderPreferences.daily_logging_hour,
          budgetAlertsEnabled: reminderPreferences.budget_alerts_enabled,
          budgetAlertThreshold: reminderPreferences.budget_alert_threshold
        })
      });

      if (!response.ok) {
        throw await parseApiResponseError(response, "Failed to update reminder preferences.");
      }

      const body = (await response.json()) as { preferences: ReminderPreferences };
      setReminderPreferences(body.preferences);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to update reminder preferences.");
    } finally {
      setIsSavingReminderPreferences(false);
    }
  }

  async function handleSaveBillReminder(
    input: {
      title: string;
      amount: string;
      category: string;
      dueDate: string;
      recurrence: BillReminderRecurrence;
      intervalCount: number;
      reminderDaysBefore: number;
      isActive: boolean;
    },
    billReminderId?: string
  ) {
    if (!currentUser) {
      setAuthMessage("Sign in to manage bill reminders.");
      return false;
    }

    setIsSavingBillReminder(true);

    try {
      await saveBillReminder(input, currentUser, billReminderId);
      await loadBillReminders(currentUser);
      await loadNotifications(currentUser);
      setAuthMessage("");
      return true;
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to save bill reminder.");
      return false;
    } finally {
      setIsSavingBillReminder(false);
    }
  }

  async function handleDeleteBillReminder(billReminderId: string) {
    if (!currentUser) {
      setAuthMessage("Sign in to manage bill reminders.");
      return false;
    }

    setIsSavingBillReminder(true);

    try {
      await deleteBillReminderEntry(billReminderId, currentUser);
      await loadBillReminders(currentUser);
      setAuthMessage("");
      return true;
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to delete bill reminder.");
      return false;
    } finally {
      setIsSavingBillReminder(false);
    }
  }

  function openDeleteAccountModal() {
    setIsProfileMenuOpen(false);
    setIsDeleteAccountModalOpen(true);
  }

  function closeDeleteAccountModal() {
    if (isDeletingAccount) {
      return;
    }

    setIsDeleteAccountModalOpen(false);
  }

  function handleCategorySelect(category: CategoryOption) {
    setForm((current) => ({ ...current, category: category.label }));
  }

  function handleCreateCustomCategory() {
    if (!currentUser) {
      return;
    }

    const trimmedName = customCategoryName.trim();

    if (!trimmedName) {
      setErrorMessage("Enter a category name before adding it.");
      return;
    }

    const existingCategory = availableCategoryOptions.find((option) => option.label.toLowerCase() === trimmedName.toLowerCase());

    if (existingCategory) {
      handleCategorySelect(existingCategory);
      setCustomCategoryName("");
      setErrorMessage("");
      setStatusMessage("Category selected.");
      return;
    }

    const nextCategory: CategoryOption = {
      id: `${slugifyCategoryLabel(trimmedName)}-${Date.now()}`,
      label: trimmedName,
      icon: suggestFaIcon(trimmedName),
      isCustom: true
    };

    const nextCategories = [...customCategories, nextCategory];
    setCustomCategories(nextCategories);
    writeCustomCategories(currentUser.uid, nextCategories);
    setForm((current) => ({ ...current, category: nextCategory.label }));
    setCustomCategoryName("");
    setErrorMessage("");
    setStatusMessage("Custom category added.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser) {
      setErrorMessage("Sign in to save expenses to your private account.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsSubmitting(true);

    if (editingExpenseId) {
      try {
        await updateExpense(editingExpenseId, form, currentUser);
        setEditingExpenseId(null);
        setForm(initialFormState);
        setStatusMessage("Expense updated.");
        await loadExpenses(currentUser, selectedCategory, sortNewestFirst);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to update expense.");
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const pendingSubmission = { idempotencyKey, payload: form, userId: currentUser.uid };
    writePendingSubmission(pendingSubmission);

    try {
      await createExpense(form, idempotencyKey, currentUser);
      writePendingSubmission(null);
      setForm(initialFormState);
      setStatusMessage("Expense saved.");
      await loadExpenses(currentUser, selectedCategory, sortNewestFirst);
      void runChecksAndReloadNotifications(currentUser);
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        writePendingSubmission(null);
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBudgetFormChange(updater: (current: BudgetForm) => BudgetForm) {
    setBudgetForm((current) => {
      const nextBudgetForm = updater(current);

      if (nextBudgetForm.scope === "monthly") {
        return {
          ...nextBudgetForm,
          category: ""
        };
      }

      return nextBudgetForm;
    });
  }

  function handleBudgetEditStart(budget: Budget) {
    setEditingBudgetId(budget.id);
    setBudgetForm({
      amount: budget.amount,
      scope: budget.scope,
      category: budget.category ?? "",
      month: budget.month
    });
    setBudgetErrorMessage("");
    setBudgetStatusMessage("");
    setIsBudgetHistoryOpen(false);
  }

  function handleBudgetEditCancel() {
    setEditingBudgetId(null);
    setBudgetForm(initialBudgetFormState);
    setBudgetErrorMessage("");
    setBudgetStatusMessage("");
  }

  async function handleBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser) {
      setBudgetErrorMessage("Sign in to save budgets to your private account.");
      return;
    }

    setBudgetErrorMessage("");
    setBudgetStatusMessage("");
    setIsBudgetSubmitting(true);

    try {
      if (editingBudgetId) {
        await updateBudget(editingBudgetId, budgetForm, currentUser);
        setBudgetStatusMessage("Budget updated.");
      } else {
        await createBudget(budgetForm, currentUser);
        setBudgetStatusMessage("Budget saved.");
      }

      setEditingBudgetId(null);
      setBudgetForm(initialBudgetFormState);
      await loadBudgets(currentUser);
    } catch (error) {
      setBudgetErrorMessage(error instanceof Error ? error.message : editingBudgetId ? "Failed to update budget." : "Failed to save budget.");
    } finally {
      setIsBudgetSubmitting(false);
    }
  }

  async function handleBudgetDelete(budgetId: string) {
    if (!currentUser) {
      return;
    }

    const confirmed = window.confirm("Delete this budget permanently?");

    if (!confirmed) {
      return;
    }

    setDeletingBudgetIds((current) => [...new Set([...current, budgetId])]);
    setBudgetErrorMessage("");
    setBudgetStatusMessage("");

    try {
      await deleteBudget(budgetId, currentUser);

      if (editingBudgetId === budgetId) {
        setEditingBudgetId(null);
        setBudgetForm(initialBudgetFormState);
      }

      setBudgetStatusMessage("Budget deleted.");
      await loadBudgets(currentUser);
    } catch (error) {
      setBudgetErrorMessage(error instanceof Error ? error.message : "Failed to delete budget.");
    } finally {
      setDeletingBudgetIds((current) => current.filter((id) => id !== budgetId));
    }
  }

  const dashboardBudgetCategoryOptions = useMemo(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet) {
      return budgetCategoryOptions;
    }

    const optionsByLabel = new Map<string, CategoryOption>();

    for (const option of budgetCategoryOptions) {
      optionsByLabel.set(option.label.toLowerCase(), option);
    }

    for (const expense of dashboardWallet.expenses) {
      const key = expense.category.toLowerCase();
      if (!optionsByLabel.has(key)) {
        optionsByLabel.set(key, {
          id: key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wallet-category",
          label: expense.category,
          icon: "other"
        });
      }
    }

    return [...optionsByLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [budgetCategoryOptions, dashboardViewMode, dashboardWallet]);

  async function handleDashboardBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (dashboardViewMode === "wallet" && dashboardWalletId) {
      event.preventDefault();

      if (!currentUser) {
        setBudgetErrorMessage("Sign in to save group budgets.");
        return;
      }

      setBudgetErrorMessage("");
      setBudgetStatusMessage("");
      setIsBudgetSubmitting(true);

      try {
        if (editingBudgetId) {
          const wallet = await updateWalletBudget(dashboardWalletId, editingBudgetId, budgetForm, currentUser);
          setSelectedWallet(wallet);
          setBudgetStatusMessage("Group budget updated.");
        } else {
          const wallet = await createWalletBudget(dashboardWalletId, budgetForm, currentUser);
          setSelectedWallet(wallet);
          setBudgetStatusMessage("Group budget saved.");
        }

        setEditingBudgetId(null);
        setBudgetForm(initialBudgetFormState);
      } catch (error) {
        setBudgetErrorMessage(error instanceof Error ? error.message : editingBudgetId ? "Failed to update group budget." : "Failed to save group budget.");
      } finally {
        setIsBudgetSubmitting(false);
      }

      return;
    }

    return handleBudgetSubmit(event);
  }

  async function handleDashboardBudgetDelete(budgetId: string) {
    if (dashboardViewMode === "wallet" && dashboardWalletId) {
      if (!currentUser) {
        return;
      }

      const confirmed = window.confirm("Delete this group budget permanently?");

      if (!confirmed) {
        return;
      }

      setDeletingBudgetIds((current) => [...new Set([...current, budgetId])]);
      setBudgetErrorMessage("");
      setBudgetStatusMessage("");

      try {
        const wallet = await deleteWalletBudget(dashboardWalletId, budgetId, currentUser);
        setSelectedWallet(wallet);

        if (editingBudgetId === budgetId) {
          setEditingBudgetId(null);
          setBudgetForm(initialBudgetFormState);
        }

        setBudgetStatusMessage("Group budget deleted.");
      } catch (error) {
        setBudgetErrorMessage(error instanceof Error ? error.message : "Failed to delete group budget.");
      } finally {
        setDeletingBudgetIds((current) => current.filter((id) => id !== budgetId));
      }

      return;
    }

    return handleBudgetDelete(budgetId);
  }

  function handleClearExpenseFilters() {
    setSelectedCategory("");
    setSelectedTimeRange("all");
    setSortNewestFirst(true);
  }

  function renderSignedInPage(page: "dashboard" | "expenses" | "wallets" | "alerts") {
    if (!currentUser) {
      return null;
    }

    return (
      <SignedInLayout
        currentUser={currentUser}
        isProfileMenuOpen={isProfileMenuOpen}
        profileMenuRef={profileMenuRef}
        isNotificationPanelOpen={isNotificationPanelOpen}
        notificationPanelRef={notificationPanelRef}
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        isDeletingAccount={isDeletingAccount}
        notifications={notifications}
        billReminders={billReminders}
        unreadNotificationCount={unreadNotificationCount}
        reminderPreferences={reminderPreferences}
        isSavingReminderPreferences={isSavingReminderPreferences}
        isSavingBillReminder={isSavingBillReminder}
        isRunningNotificationChecks={isRunningNotificationChecks}
        onToggleProfileMenu={() => setIsProfileMenuOpen((current) => !current)}
        onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
        onToggleNotificationPanel={() => {
          setIsProfileMenuOpen(false);
          setIsNotificationPanelOpen((current) => !current);
        }}
        onCloseNotificationPanel={() => setIsNotificationPanelOpen(false)}
        onMarkNotificationRead={(notificationId) => {
          void handleMarkNotificationRead(notificationId);
        }}
        onMarkAllNotificationsRead={() => {
          void handleMarkAllNotificationsRead();
        }}
        onDeleteNotification={(notificationId) => handleDeleteNotification(notificationId)}
        onRunNotificationChecks={() => {
          void handleRunNotificationChecks();
        }}
        onRespondToWalletInvite={(walletMemberId, action) => handleRespondToWalletInvite(walletMemberId, action)}
        onSaveBillReminder={(input, billReminderId) => handleSaveBillReminder(input, billReminderId)}
        onDeleteBillReminder={(billReminderId) => handleDeleteBillReminder(billReminderId)}
        onReminderPreferencesChange={handleReminderPreferencesChange}
        onSaveReminderPreferences={() => {
          void handleSaveReminderPreferences();
        }}
        onSignOut={handleSignOut}
        onOpenDeleteAccountModal={openDeleteAccountModal}
        onCloseDeleteAccountModal={closeDeleteAccountModal}
        onDeleteAccount={handleDeleteAccount}
      >
        {page === "dashboard" ? (
          <DashboardPage
            categories={dashboardViewMode === "wallet" ? dashboardCategories : categories}
            dashboardInsights={dashboardInsights}
            wallets={wallets}
            dashboardViewMode={dashboardViewMode}
            dashboardWalletId={dashboardWalletId}
            onDashboardViewModeChange={(mode) => { setDashboardViewMode(mode); setSelectedCategory(""); if (mode === "personal") { setDashboardWalletId(null); } else if (wallets.length > 0 && !dashboardWalletId) { setDashboardWalletId(wallets[0].id); } }}
            onDashboardWalletIdChange={setDashboardWalletId}
            budgetForm={budgetForm}
            budgetCategoryOptions={dashboardBudgetCategoryOptions}
            currentBudgetMonthLabel={formatBudgetMonth(currentBudgetMonth)}
            currentMonthBudgetSummaries={dashboardCurrentMonthBudgetSummaries}
            currentMonthBudgetOverview={dashboardCurrentMonthBudgetOverview}
            budgetHistoryGroups={dashboardBudgetHistoryGroups}
            budgetHistoryRange={budgetHistoryRange}
            chartDisplayType={chartDisplayType}
            selectedCategory={selectedCategory}
            selectedTimeRange={selectedTimeRange}
            chartGranularity={chartGranularity}
            total={total}
            dashboardStats={dashboardStats}
            spendTrend={spendTrend}
            trendDetailLookup={trendDetailLookup}
            chartSummary={chartSummary}
            editingBudgetId={editingBudgetId}
            deletingBudgetIds={deletingBudgetIds}
            isBudgetLoading={isBudgetLoading}
            isBudgetSubmitting={isBudgetSubmitting}
            isBudgetHistoryOpen={isBudgetHistoryOpen}
            budgetStatusMessage={budgetStatusMessage}
            budgetErrorMessage={budgetErrorMessage}
            formatCurrency={formatCurrency}
            onBudgetFormChange={handleBudgetFormChange}
            onBudgetSubmit={handleDashboardBudgetSubmit}
            onBudgetEditCancel={handleBudgetEditCancel}
            onBudgetEditStart={handleBudgetEditStart}
            onBudgetDelete={handleDashboardBudgetDelete}
            onBudgetHistoryRangeChange={setBudgetHistoryRange}
            onOpenBudgetHistory={() => setIsBudgetHistoryOpen(true)}
            onCloseBudgetHistory={() => setIsBudgetHistoryOpen(false)}
            onSelectedCategoryChange={setSelectedCategory}
            onSelectedTimeRangeChange={setSelectedTimeRange}
            onChartDisplayTypeChange={setChartDisplayType}
            onChartGranularityChange={setChartGranularity}
          />
        ) : page === "expenses" ? (
            <ExpensesPage
              currentUserPresent={Boolean(currentUser)}
              authLoading={authLoading}
              form={form}
              editingExpenseId={editingExpenseId}
              isSubmitting={isSubmitting}
              statusMessage={statusMessage}
              errorMessage={errorMessage}
              customCategoryName={customCategoryName}
              selectedCategory={selectedCategory}
              selectedTimeRange={selectedTimeRange}
              sortNewestFirst={sortNewestFirst}
              categories={categories}
              visibleExpenses={paginatedExpenses}
              totalVisibleExpenses={visibleExpenses.length}
              currentExpensesPage={currentExpensesPage}
              totalExpensePages={totalExpensePages}
              expensesPageSize={EXPENSES_PAGE_SIZE}
              availableCategoryOptions={availableCategoryOptions}
              selectedCategoryOption={selectedCategoryOption}
              isOtherCategorySelected={isOtherCategorySelected}
              selectedExpenseIds={selectedExpenseIds}
              selectedVisibleExpenseIds={selectedVisibleExpenseIds}
              areAllVisibleExpensesSelected={areAllVisibleExpensesSelected}
              deletingExpenseIds={deletingExpenseIds}
              isLoading={isLoading}
              formatCurrency={formatCurrency}
              resolveCategoryIcon={resolveCategoryIcon}
              onFormChange={setForm}
              onCategorySelect={handleCategorySelect}
              onCustomCategoryNameChange={setCustomCategoryName}
              onCreateCustomCategory={handleCreateCustomCategory}
              onSubmit={handleSubmit}
              onEditCancel={handleEditCancel}
              onSelectedCategoryChange={setSelectedCategory}
              onSortNewestFirstChange={setSortNewestFirst}
              onSelectedTimeRangeChange={setSelectedTimeRange}
              onExpensesPageChange={setCurrentExpensesPage}
              onDeleteSelectedExpenses={handleDeleteSelectedExpenses}
              onToggleSelectAllVisibleExpenses={handleToggleSelectAllVisibleExpenses}
              onToggleExpenseSelection={handleToggleExpenseSelection}
              onEditStart={handleEditStart}
              onDeleteExpense={handleDeleteExpense}
              onClearFilters={handleClearExpenseFilters}
            />
          ) : page === "wallets" ? (
            <WalletsPage
              wallets={wallets}
              selectedWallet={selectedWallet}
              selectedWalletId={selectedWalletId}
              currentUserId={currentUser.uid}
              budgetCategoryOptions={budgetCategoryOptions}
              isLoading={isWalletLoading}
              isSubmitting={isWalletSubmitting}
              submittingAction={walletSubmittingAction}
              statusMessage={walletStatusMessage}
              errorMessage={walletErrorMessage}
              formatCurrency={formatCurrency}
              onSelectWallet={setSelectedWalletId}
              onCreateWallet={handleCreateWallet}
              onDeleteWallet={handleDeleteWallet}
              onLeaveWallet={handleLeaveWallet}
              onAddWalletMember={handleAddWalletMember}
              onRemoveWalletMember={handleRemoveWalletMember}
              onCreateWalletExpense={handleCreateWalletExpense}
              onUpdateWalletExpense={handleUpdateWalletExpense}
              onDeleteWalletExpense={handleDeleteWalletExpense}
              onCreateWalletBudget={handleCreateWalletBudget}
              onUpdateWalletBudget={handleUpdateWalletBudget}
              onDeleteWalletBudget={handleDeleteWalletBudget}
              onCreateWalletSettlement={handleCreateWalletSettlement}
              onUpdateWalletSettlement={handleUpdateWalletSettlement}
              onDeleteWalletSettlement={handleDeleteWalletSettlement}
            />
          ) : (
            <AlertsPage
              notifications={notifications}
              billReminders={billReminders}
              isSavingPreferences={isSavingReminderPreferences}
              isSavingBillReminder={isSavingBillReminder}
              isRunningChecks={isRunningNotificationChecks}
              preferences={reminderPreferences}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onDeleteNotification={handleDeleteNotification}
              onRefreshChecks={handleRunNotificationChecks}
              onRespondToWalletInvite={handleRespondToWalletInvite}
              onSaveBillReminder={handleSaveBillReminder}
              onDeleteBillReminder={handleDeleteBillReminder}
              onPreferencesChange={handleReminderPreferencesChange}
              onSavePreferences={handleSaveReminderPreferences}
            />
          )}
      </SignedInLayout>
    );
  }

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[780px] items-center justify-center px-4 py-6 sm:px-6">
        <section className="surface-card w-full max-w-[520px] p-8 text-center sm:p-10">
          <p className="section-eyebrow">Secure access</p>
          <h1 className="mt-4 font-display text-[3.2rem] leading-none tracking-[-0.04em] text-ink">Checking your session...</h1>
          <p className="mt-4 text-base leading-7 text-secondary">The app is verifying whether you already have an authenticated session before routing you into the product.</p>
        </section>
      </main>
    );
  }

  return (
    <Routes>
      {currentUser ? (
        <>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/signin" element={<Navigate to="/dashboard" replace />} />
          <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={renderSignedInPage("dashboard")} />
          <Route path="/expenses" element={renderSignedInPage("expenses")} />
          <Route path="/wallets" element={renderSignedInPage("wallets")} />
          <Route path="/alerts" element={renderSignedInPage("alerts")} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<LandingPage onCreateAccount={() => navigate("/signup")} onSignIn={() => navigate("/signin")} formatCurrency={formatCurrency} />} />
          <Route path="/signin" element={<AuthPage mode="signin" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={handleSignIn} />} />
          <Route path="/signup" element={<AuthPage mode="signup" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={handleSignIn} />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/expenses" element={<Navigate to="/" replace />} />
          <Route path="/wallets" element={<Navigate to="/" replace />} />
          <Route path="/alerts" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
