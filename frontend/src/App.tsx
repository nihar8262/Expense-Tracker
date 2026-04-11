import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AuthProvider, User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, authPersistenceReady, facebookProvider, githubProvider, googleProvider, isFirebaseConfigured } from "./auth";

type Expense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  created_at: string;
};

type ExpenseForm = {
  amount: string;
  category: string;
  description: string;
  date: string;
};

type PendingSubmission = {
  idempotencyKey: string;
  payload: ExpenseForm;
  userId: string;
};

type ProviderOption = {
  id: "google" | "github" | "facebook";
  label: string;
  blurb: string;
  provider: AuthProvider;
};

type TimeRangeFilter = "all" | "week" | "month" | "year";
type ChartGranularity = "daily" | "monthly" | "quarterly" | "yearly";
type CategoryIconId = "groceries" | "food" | "travel" | "shopping" | "bills" | "health" | "entertainment" | "work" | "other";

type TrendPoint = {
  key: string;
  label: string;
  shortLabel: string;
  total: number;
  count: number;
  order: number;
};

type CategoryOption = {
  id: string;
  label: string;
  icon: CategoryIconId;
  isCustom?: boolean;
};

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

const iconOptions: Array<{ id: CategoryIconId; label: string }> = [
  { id: "groceries", label: "Groceries" },
  { id: "food", label: "Food" },
  { id: "travel", label: "Travel" },
  { id: "shopping", label: "Shopping" },
  { id: "bills", label: "Bills" },
  { id: "health", label: "Health" },
  { id: "entertainment", label: "Entertainment" },
  { id: "work", label: "Work" },
  { id: "other", label: "Other" }
];

const defaultCategoryOptions: CategoryOption[] = [
  { id: "groceries", label: "Groceries", icon: "groceries" },
  { id: "food", label: "Food", icon: "food" },
  { id: "travel", label: "Travel", icon: "travel" },
  { id: "shopping", label: "Shopping", icon: "shopping" },
  { id: "bills", label: "Bills", icon: "bills" },
  { id: "health", label: "Health", icon: "health" },
  { id: "entertainment", label: "Entertainment", icon: "entertainment" },
  { id: "work", label: "Work", icon: "work" },
  { id: "others", label: "Others", icon: "other" }
];

const initialFormState: ExpenseForm = {
  amount: "",
  category: "",
  description: "",
  date: ""
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
  const url = API_BASE_URL
    ? new URL("/api/expenses", API_BASE_URL)
    : new URL("/api/expenses", window.location.origin);

  if (category) {
    url.searchParams.set("category", category);
  }

  if (sortNewestFirst) {
    url.searchParams.set("sort", "date_desc");
  }

  return url.toString();
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

function CategoryIcon({ iconId }: { iconId: CategoryIconId }) {
  if (iconId === "groceries") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 4a1 1 0 0 1 1 1v1h8V5a1 1 0 1 1 2 0v1h1a1 1 0 0 1 .97 1.24l-1.8 7.2A3 3 0 0 1 15.26 17H9.18a3 3 0 0 1-2.91-2.27L4.47 7.52A1 1 0 0 1 5.44 6H6V5a1 1 0 0 1 1-1Zm.94 4 1.27 5.07a1 1 0 0 0 .97.76h5.08a1 1 0 0 0 .97-.76L17.5 8H7.94ZM9 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
    );
  }

  if (iconId === "food") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v7a3 3 0 0 1-2 2.82V21a1 1 0 1 1-2 0v-8.18A3 3 0 0 1 2 10V3a1 1 0 1 1 2 0v4h1V3a1 1 0 1 1 2 0v4h1V3a1 1 0 0 1 1-1Zm10 0a1 1 0 0 1 1 1v18a1 1 0 1 1-2 0v-7h-2a1 1 0 0 1-1-1V8a6 6 0 0 1 4-5.66V2Z" />
      </svg>
    );
  }

  if (iconId === "travel") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 3.5a2.5 2.5 0 0 1 5 0V5h3a2 2 0 0 1 2 2v9.5a2.5 2.5 0 0 1-5 0V16H9v.5a2.5 2.5 0 0 1-5 0V7a2 2 0 0 1 2-2h4V3.5ZM8 7H6v2h2V7Zm10 0h-2v2h2V7Zm-8-3.5V5h3V3.5a1.5 1.5 0 0 0-3 0ZM6 11v5.5a.5.5 0 1 0 1 0V16h10v.5a.5.5 0 1 0 1 0V11H6Z" />
      </svg>
    );
  }

  if (iconId === "shopping") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 7a4 4 0 1 1 8 0h2a1 1 0 0 1 1 1.12l-1.2 11A2 2 0 0 1 15.82 21H8.18a2 2 0 0 1-1.98-1.88L5 8.12A1 1 0 0 1 6 7h2Zm2 0h4a2 2 0 1 0-4 0Zm-2.82 2 .98 9h7.68l.98-9H7.18Z" />
      </svg>
    );
  }

  if (iconId === "bills") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v16.5a.5.5 0 0 1-.8.4L16 19.25l-2.2 1.65a.5.5 0 0 1-.6 0L11 19.25 8.8 20.9a.5.5 0 0 1-.8-.4V4a1 1 0 0 1 1-1Zm2 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z" />
      </svg>
    );
  }

  if (iconId === "health") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M11 4a1 1 0 0 1 2 0v3h3a1 1 0 1 1 0 2h-3v3a1 1 0 1 1-2 0V9H8a1 1 0 1 1 0-2h3V4Zm1 18s-7-4.35-9.54-9.1C.78 9.76 2.2 6 5.78 6c2 0 3.12 1.17 3.72 2.1.6-.93 1.72-2.1 3.72-2.1 3.58 0 5 3.76 3.32 6.9C19 17.65 12 22 12 22Z" />
      </svg>
    );
  }

  if (iconId === "entertainment") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18 4a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H9.41l-3.7 2.78A1 1 0 0 1 4 20V6a2 2 0 0 1 2-2h12Zm-8 4v6l5-3-5-3Z" />
      </svg>
    );
  }

  if (iconId === "work") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v3h-8v2h-2v-2H3V8a2 2 0 0 1 2-2h4V4Zm2 2h2V4h-2v2Zm10 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5h8v2h2v-2h8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a6 6 0 0 1 4.24 10.24l-6.95 6.95a1.5 1.5 0 0 1-2.12-2.12l6.95-6.95A4 4 0 1 0 8 6a1 1 0 1 1-2 0 6 6 0 0 1 6-4Zm5.66 12.24a1 1 0 0 1 0 1.42l-2 2a1 1 0 0 1-1.42-1.42l2-2a1 1 0 0 1 1.42 0Zm-8.49.34a1 1 0 0 1 0 1.42l-2.59 2.59a1 1 0 1 1-1.41-1.42l2.58-2.59a1 1 0 0 1 1.42 0Z" />
    </svg>
  );
}

function resolveCategoryIcon(categoryLabel: string, categoryOptions: CategoryOption[]): CategoryIconId {
  return categoryOptions.find((option) => option.label.toLowerCase() === categoryLabel.trim().toLowerCase())?.icon ?? "other";
}

class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.retryable = status >= 500;
  }
}

function ProviderLogo({ providerId }: { providerId: ProviderOption["id"] }) {
  if (providerId === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-.8 2.3-1.7 3.1l3 2.3c1.8-1.6 2.8-4 2.8-6.9 0-.7-.1-1.4-.2-2H12Z" />
        <path fill="#34A853" d="M12 22c2.5 0 4.6-.8 6.1-2.3l-3-2.3c-.8.6-1.8 1-3.1 1-2.4 0-4.5-1.6-5.2-3.8l-3.1 2.4C5.2 19.9 8.3 22 12 22Z" />
        <path fill="#4A90E2" d="M6.8 14.6c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8L3.7 8.6C3 10 2.6 11.4 2.6 12.8s.4 2.8 1.1 4.2l3.1-2.4Z" />
        <path fill="#FBBC05" d="M12 7.2c1.4 0 2.7.5 3.7 1.4l2.7-2.7C16.6 4.2 14.5 3.4 12 3.4c-3.7 0-6.8 2.1-8.3 5.2L6.8 11c.7-2.2 2.8-3.8 5.2-3.8Z" />
      </svg>
    );
  }

  if (providerId === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2.2a9.9 9.9 0 0 0-3.1 19.3c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-4.9 0-1.1.4-2 .9-2.8-.1-.2-.4-1.3.1-2.7 0 0 .8-.2 2.8 1 .8-.2 1.6-.3 2.4-.3.8 0 1.6.1 2.4.3 2-1.2 2.8-1 2.8-1 .5 1.4.2 2.5.1 2.7.6.8.9 1.7.9 2.8 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.9V21c0 .3.2.6.7.5A9.9 9.9 0 0 0 12 2.2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
      <path fill="#fff" d="M16.7 15.5 17.2 12h-3.4V9.8c0-1 .5-1.9 2-1.9h1.5v-3s-1.4-.2-2.7-.2c-2.7 0-4.5 1.7-4.5 4.7V12h-3v3.5h3v8.4c.6.1 1.3.1 1.9.1.6 0 1.2 0 1.8-.1v-8.4h2.9Z" />
    </svg>
  );
}

async function buildAuthorizedHeaders(user: User, extraHeaders: Record<string, string> = {}) {
  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders
  };
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

async function deleteAccountData(user: User): Promise<void> {
  const endpoint = API_BASE_URL ? new URL("/api/account", API_BASE_URL).toString() : "/api/account";
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: await buildAuthorizedHeaders(user)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to delete account.", response.status);
  }
}

export default function App() {
  const [form, setForm] = useState<ExpenseForm>(initialFormState);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [customCategoryIcon, setCustomCategoryIcon] = useState<CategoryIconId>("other");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRangeFilter>("all");
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("monthly");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [activePage, setActivePage] = useState<"dashboard" | "expenses">("dashboard");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deletingExpenseIds, setDeletingExpenseIds] = useState<string[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [publicView, setPublicView] = useState<"landing" | "auth">("landing");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(() => {
    return [...new Set(expenses.map((expense) => expense.category))].sort((left, right) => left.localeCompare(right));
  }, [expenses]);

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

  const selectedCategoryOption = useMemo(() => {
    return availableCategoryOptions.find((option) => option.label.toLowerCase() === form.category.trim().toLowerCase()) ?? null;
  }, [availableCategoryOptions, form.category]);

  const isOtherCategorySelected = selectedCategoryOption?.id === "others";

  const visibleExpenses = useMemo(() => {
    return expenses.filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange));
  }, [expenses, selectedTimeRange]);

  const allVisibleExpenseIds = useMemo(() => visibleExpenses.map((expense) => expense.id), [visibleExpenses]);

  const selectedVisibleExpenseIds = useMemo(() => allVisibleExpenseIds.filter((expenseId) => selectedExpenseIds.includes(expenseId)), [allVisibleExpenseIds, selectedExpenseIds]);

  const areAllVisibleExpensesSelected = allVisibleExpenseIds.length > 0 && selectedVisibleExpenseIds.length === allVisibleExpenseIds.length;

  const spendTrend = useMemo(() => {
    return buildTrendPoints(visibleExpenses, chartGranularity);
  }, [visibleExpenses, chartGranularity]);

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

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    const areaPath = points.length > 0 ? `${linePath} L ${points[points.length - 1]?.x.toFixed(2)} ${chartHeight} L ${points[0]?.x.toFixed(2)} ${chartHeight} Z` : "";

    return {
      points,
      peakValue,
      linePath,
      areaPath
    };
  }, [spendTrend]);

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
      setIsDeleteAccountModalOpen(false);

      if (!user) {
        setExpenses([]);
        setCustomCategories([]);
        setCustomCategoryName("");
        setCustomCategoryIcon("other");
        setForm(initialFormState);
        setSelectedCategory("");
        setSelectedExpenseIds([]);
        setActivePage("dashboard");
        setEditingExpenseId(null);
        setPublicView((currentView) => (currentView === "auth" ? "auth" : "landing"));
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
    setSelectedExpenseIds((current) => current.filter((expenseId) => allVisibleExpenseIds.includes(expenseId)));
  }, [allVisibleExpenseIds]);

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
      setPublicView("landing");
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
    setActivePage("dashboard");
    setIsProfileMenuOpen(false);
    setSelectedExpenseIds([]);
    setEditingExpenseId(null);
    setPublicView("landing");
  }

  function handleEditStart(expense: Expense) {
    setActivePage("expenses");
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
      setIsDeleteAccountModalOpen(false);
      setExpenses([]);
      setCustomCategories([]);
      setForm(initialFormState);
      setSelectedCategory("");
      setSelectedExpenseIds([]);
      setEditingExpenseId(null);
      setActivePage("dashboard");
      if (auth) {
        await signOut(auth);
      }
      setCurrentUser(null);
      setPublicView("landing");
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
      setCustomCategoryIcon(existingCategory.icon);
      setErrorMessage("");
      setStatusMessage("Category selected.");
      return;
    }

    const nextCategory: CategoryOption = {
      id: `${slugifyCategoryLabel(trimmedName)}-${Date.now()}`,
      label: trimmedName,
      icon: customCategoryIcon,
      isCustom: true
    };

    const nextCategories = [...customCategories, nextCategory];
    setCustomCategories(nextCategories);
    writeCustomCategories(currentUser.uid, nextCategories);
    setForm((current) => ({ ...current, category: nextCategory.label }));
    setCustomCategoryName("");
    setCustomCategoryIcon("other");
    setErrorMessage("");
    setStatusMessage("Custom category added.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        writePendingSubmission(null);
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const total = useMemo(() => {
    const amount = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    return formatCurrency(amount.toFixed(2));
  }, [visibleExpenses]);

  const dashboardStats = useMemo(() => {
    const expenseCount = visibleExpenses.length;
    const rawTotal = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const average = expenseCount > 0 ? rawTotal / expenseCount : 0;

    const categoryTotals = visibleExpenses.reduce<Record<string, number>>((accumulator, expense) => {
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

    const latestExpense = [...visibleExpenses].sort((left, right) => {
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
  }, [visibleExpenses]);

  if (!currentUser) {
    return (
      <main className={publicView === "landing" ? "app-shell landing-shell" : "app-shell auth-shell"}>
        {publicView === "landing" ? (
          <>
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="eyebrow">Expense Tracker</p>
                <h1>Track your money in a space that feels calm, personal, and precise.</h1>
                <p className="lede">
                  Keep every expense inside a private account, review clean totals at a glance, and move from quick capture to clear decisions without visual clutter.
                </p>

                <div className="landing-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setAuthMode("signup");
                      setPublicView("auth");
                    }}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setAuthMode("signin");
                      setPublicView("auth");
                    }}
                  >
                    Sign in
                  </button>
                </div>
              </div>

              <section className="card landing-preview">
                <div className="preview-stack">
                  <div className="preview-badge">Private dashboard</div>
                  <div className="preview-total">
                    <span>This month</span>
                    <strong>{formatCurrency("18460.00")}</strong>
                  </div>
                  <div className="preview-list">
                    <div>
                      <span>Groceries</span>
                      <strong>{formatCurrency("5320.00")}</strong>
                    </div>
                    <div>
                      <span>Commute</span>
                      <strong>{formatCurrency("2180.00")}</strong>
                    </div>
                    <div>
                      <span>Subscriptions</span>
                      <strong>{formatCurrency("1199.00")}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </section>

            <section className="landing-grid">
              <article className="card landing-card">
                <p className="eyebrow">Private by account</p>
                <h2>Every expense stays attached to the person who created it.</h2>
                <p>No shared ledger confusion. Sign in and your own categories, totals, and recent activity are the only things returned.</p>
              </article>

              <article className="card landing-card">
                <p className="eyebrow">Reliable capture</p>
                <h2>Resilient saves keep submissions safe even across refreshes.</h2>
                <p>The tracker keeps idempotent expense creation in place so repeated requests do not duplicate the same entry.</p>
              </article>

              <article className="card landing-card accent-card">
                <p className="eyebrow">Focused review</p>
                <h2>See totals, leading categories, and recent activity right after login.</h2>
                <p>The dashboard is designed to feel light, but still useful enough for daily spending review.</p>
              </article>
            </section>
          </>
        ) : (
          <section className="auth-page-frame">
            <button type="button" className="text-button" onClick={() => setPublicView("landing")}>
              Back to landing
            </button>

            <section className="card auth-panel auth-panel-minimal">
              <div className="auth-panel-top">
                <div>
                  <p className="eyebrow">Secure Access</p>
                  <h2>{authMode === "signin" ? "Sign in" : "Sign up"}</h2>
                </div>

                <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
                  <button
                    type="button"
                    className={authMode === "signin" ? "auth-toggle-button is-active" : "auth-toggle-button"}
                    onClick={() => setAuthMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={authMode === "signup" ? "auth-toggle-button is-active" : "auth-toggle-button"}
                    onClick={() => setAuthMode("signup")}
                  >
                    Sign up
                  </button>
                </div>
              </div>

              <p className="auth-panel-copy">
                {authMode === "signin"
                  ? "Choose your provider to open your private expense dashboard."
                  : "Create your account with a provider below. If the account already exists, we will sign you in instead."}
              </p>

              {authLoading ? <p className="empty-state">Checking your session...</p> : null}

              {!authLoading ? (
                <div className="provider-list">
                  {providerOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`provider-button provider-${option.id}`}
                      onClick={() => void handleSignIn(option.provider)}
                    >
                      <span className="provider-mark">
                        <ProviderLogo providerId={option.id} />
                      </span>
                      <span className="provider-text">
                        <strong>{authMode === "signin" ? option.label : option.label.replace("Continue", "Create account")}</strong>
                        <span>{option.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {authMessage ? <p className="status-message error">{authMessage}</p> : null}
            </section>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell signed-shell">
      <section className="card shell-topbar">
        <div className="shell-brand">
          <p className="eyebrow">Personal Finance</p>
          <h1>Expense Tracker</h1>
        </div>

        <nav className="page-nav" aria-label="Signed-in pages">
          <button
            type="button"
            className={activePage === "dashboard" ? "page-nav-button is-active" : "page-nav-button"}
            onClick={() => {
              setActivePage("dashboard");
              setIsProfileMenuOpen(false);
            }}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activePage === "expenses" ? "page-nav-button is-active" : "page-nav-button"}
            onClick={() => {
              setActivePage("expenses");
              setIsProfileMenuOpen(false);
            }}
          >
            Expenses
          </button>
        </nav>

        <div className="shell-user">
          <div className="profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className={isProfileMenuOpen ? "profile-trigger is-open" : "profile-trigger"}
              onClick={() => setIsProfileMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
            >
              {currentUser.photoURL ? <img className="avatar avatar-large" src={currentUser.photoURL} alt={currentUser.displayName ?? currentUser.email ?? "User avatar"} /> : <div className="avatar avatar-large avatar-fallback">{(currentUser.displayName ?? currentUser.email ?? "U").slice(0, 1).toUpperCase()}</div>}

              <div className="profile-copy shell-meta">
                <p className="eyebrow">Signed in</p>
                <h2>{currentUser.displayName ?? "Your profile"}</h2>
              </div>

              <span className="profile-trigger-caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-header">
                  <strong>{currentUser.displayName ?? "Your profile"}</strong>
                  <span>{currentUser.email ?? currentUser.uid}</span>
                </div>

                <div className="profile-dropdown-actions">
                  <button type="button" className="secondary-button shell-action-button signout-button" onClick={() => void handleSignOut()}>
                    Sign out
                  </button>
                  <button type="button" className="secondary-button shell-action-button destructive-shell-button" disabled={isDeletingAccount} onClick={openDeleteAccountModal}>
                    Delete account
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isDeleteAccountModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteAccountModal}>
          <section
            className="card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-modal-title"
            aria-describedby="delete-account-modal-copy"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Confirm deletion</p>
            <h2 id="delete-account-modal-title">Delete your account?</h2>
            <p id="delete-account-modal-copy" className="confirm-modal-copy">
              This will permanently remove your account and all stored expenses. This action cannot be undone.
            </p>

            <div className="confirm-modal-actions">
              <button type="button" className="ghost-button confirm-modal-button" onClick={closeDeleteAccountModal} disabled={isDeletingAccount}>
                Keep account
              </button>
              <button type="button" className="secondary-button confirm-modal-button destructive-shell-button" onClick={() => void handleDeleteAccount()} disabled={isDeletingAccount}>
                {isDeletingAccount ? "Deleting account..." : "Yes, delete it"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activePage === "dashboard" ? (
        <>
          <section className="hero-panel page-hero">
            <p className="eyebrow">Dashboard</p>
            <h1>Your spending picture, without the clutter.</h1>
            <p className="lede">This view stays focused on patterns, totals, and momentum so you can read your money at a glance.</p>
          </section>

          <section className="card filter-card">
            <div className="section-heading">
              <h2>Data view</h2>
              <p>Refine the dashboard by category and time window without leaving the analytics view.</p>
            </div>

            <div className="filter-grid">
              <label>
                <span>Category</span>
                <select value={selectedCategory} disabled={!currentUser} onChange={(event) => setSelectedCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Range</span>
                <select value={selectedTimeRange} disabled={!currentUser} onChange={(event) => setSelectedTimeRange(event.target.value as TimeRangeFilter)}>
                  <option value="all">All time</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                </select>
              </label>
            </div>
          </section>

          <section className="dashboard-grid">
            <article className="card spotlight-card">
              <p className="eyebrow">Current total</p>
              <h2>{total}</h2>
              <p className="lede">Visible spend for the active category and time filters.</p>
            </article>

            <article className="card metric-card">
              <span className="metric-label">Entries</span>
              <strong>{dashboardStats.expenseCount}</strong>
              <p>{dashboardStats.expenseCount === 1 ? "1 expense in view" : `${dashboardStats.expenseCount} expenses in view`}</p>
            </article>

            <article className="card metric-card">
              <span className="metric-label">Average spend</span>
              <strong>{dashboardStats.average}</strong>
              <p>Average amount across the current data view.</p>
            </article>

            <article className="card metric-card">
              <span className="metric-label">Top category</span>
              <strong>{dashboardStats.topCategory?.category ?? "No data"}</strong>
              <p>{dashboardStats.topCategory ? dashboardStats.topCategory.formattedAmount : "Add expenses to see category leaders."}</p>
            </article>
          </section>

          <section className="dashboard-insight-grid">
            <section className="card insight-card">
              <div className="section-heading">
                <h2>Spending breakdown</h2>
                <p>Categories with the largest share of the current view.</p>
              </div>

              {dashboardStats.categoryBreakdown.length === 0 ? <p className="empty-state">Add a few expenses to unlock category insights.</p> : null}

              {dashboardStats.categoryBreakdown.length > 0 ? (
                <div className="breakdown-list">
                  {dashboardStats.categoryBreakdown.slice(0, 5).map((item) => (
                    <div key={item.category} className="breakdown-item">
                      <div className="breakdown-meta">
                        <strong>{item.category}</strong>
                        <span>{item.formattedAmount}</span>
                      </div>
                      <div className="breakdown-bar-track">
                        <div className="breakdown-bar-fill" style={{ width: `${Math.max(item.share, 8)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="card insight-card">
              <div className="section-heading">
                <h2>Latest activity</h2>
                <p>The most recent expense in your current view.</p>
              </div>

              {dashboardStats.latestExpense ? (
                <div className="activity-highlight">
                  <span className="activity-date">{dashboardStats.latestExpense.date}</span>
                  <strong>{dashboardStats.latestExpense.description}</strong>
                  <p>{dashboardStats.latestExpense.category}</p>
                  <div className="activity-amount">{formatCurrency(dashboardStats.latestExpense.amount)}</div>
                </div>
              ) : (
                <p className="empty-state">No recent activity yet. Your next expense will appear here.</p>
              )}
            </section>
          </section>

          <section className="dashboard-detail-grid">
            <section className="card insight-card trend-card">
              <div className="section-heading trend-header">
                <div className="section-heading">
                  <h2>Spend trend</h2>
                  <p>Track how your spending moves across the current category and range filters.</p>
                </div>

                <label className="trend-filter">
                  <span>Graph by</span>
                  <select value={chartGranularity} onChange={(event) => setChartGranularity(event.target.value as ChartGranularity)}>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
              </div>

              {spendTrend.length === 0 ? (
                <p className="empty-state">Add expenses inside the selected filters to render the spending graph.</p>
              ) : (
                <>
                  <div className="trend-chart-shell">
                    <div className="trend-scale">
                      <span>{formatCurrency(chartSummary.peakValue.toFixed(2))}</span>
                      <span>{formatCurrency((chartSummary.peakValue / 2).toFixed(2))}</span>
                      <span>{formatCurrency("0")}</span>
                    </div>

                    <div className="trend-chart">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Expense trend graph">
                        <defs>
                          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(31, 111, 80, 0.22)" />
                            <stop offset="100%" stopColor="rgba(31, 111, 80, 0.01)" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="100" x2="100" y2="100" className="trend-axis" />
                        <line x1="0" y1="50" x2="100" y2="50" className="trend-grid-line" />
                        <line x1="0" y1="0" x2="100" y2="0" className="trend-grid-line" />
                        <path d={chartSummary.areaPath} fill="url(#trendFill)" className="trend-area" />
                        <path d={chartSummary.linePath} fill="none" className="trend-line" />
                        {chartSummary.points.map((point) => (
                          <circle key={point.key} cx={point.x} cy={point.y} r="1.35" className="trend-point" />
                        ))}
                      </svg>
                    </div>
                  </div>

                  <div className="trend-labels" aria-hidden="true">
                    {chartSummary.points.map((point) => (
                      <span key={point.key}>{point.shortLabel}</span>
                    ))}
                  </div>

                  <div className="trend-summary-grid">
                    {spendTrend.map((point) => (
                      <div key={point.key} className="trend-summary-item">
                        <strong>{formatCurrency(point.total.toFixed(2))}</strong>
                        <span>{point.label}</span>
                        <small>{point.count === 1 ? "1 expense" : `${point.count} expenses`}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </section>
        </>
      ) : (
        <>
          <section className="hero-panel page-hero">
            <p className="eyebrow">Expenses</p>
            <h1>Capture, review, and refine each expense in one place.</h1>
            <p className="lede">This workspace is dedicated to adding new expenses, editing existing ones, and reviewing the filtered list without mixing it into the analytics view.</p>
          </section>

          <section className="content-grid expenses-page-grid">
            <form className="card form-card" onSubmit={handleSubmit}>
              <div className="section-heading">
                <h2>{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
                <p>{editingExpenseId ? "Update the selected expense and save the revised amount, category, description, or date." : "Each save is tied to your account, and retries remain idempotent per user."}</p>
              </div>

              <label>
                <span>Amount</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={!currentUser}
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>

              <label>
                <span>Category</span>
                <div className="category-field">
                  <div className="category-selector-grid" role="list" aria-label="Expense categories">
                    {availableCategoryOptions.map((category) => {
                      const isActive = selectedCategoryOption?.label.toLowerCase() === category.label.toLowerCase();

                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={isActive ? "category-chip is-active" : "category-chip"}
                          onClick={() => handleCategorySelect(category)}
                        >
                          <span className="category-chip-icon">
                            <CategoryIcon iconId={category.icon} />
                          </span>
                          <span>{category.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {isOtherCategorySelected ? (
                    <div className="custom-category-builder">
                      <div className="custom-category-copy">
                        <strong>Need another category?</strong>
                        <p>Write your category name and choose the icon you want to save with it.</p>
                      </div>

                      <div className="icon-picker-grid" role="list" aria-label="Category icons">
                        {iconOptions.map((iconOption) => (
                          <button
                            key={iconOption.id}
                            type="button"
                            className={customCategoryIcon === iconOption.id ? "icon-picker-button is-active" : "icon-picker-button"}
                            onClick={() => setCustomCategoryIcon(iconOption.id)}
                          >
                            <span className="category-chip-icon">
                              <CategoryIcon iconId={iconOption.id} />
                            </span>
                            <span>{iconOption.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="custom-category-row">
                        <input
                          type="text"
                          placeholder="Write your category name"
                          disabled={!currentUser}
                          value={customCategoryName}
                          onChange={(event) => setCustomCategoryName(event.target.value)}
                        />
                        <button type="button" className="secondary-button" onClick={handleCreateCustomCategory}>
                          Add category
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <input type="hidden" required value={form.category} readOnly />
                </div>
              </label>

              <label>
                <span>Description</span>
                <textarea
                  required
                  rows={3}
                  disabled={!currentUser}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>

              <label>
                <span>Date</span>
                <input
                  type="date"
                  required
                  disabled={!currentUser}
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-action-button" disabled={isSubmitting || !currentUser}>
                  {isSubmitting ? (editingExpenseId ? "Updating..." : "Saving...") : editingExpenseId ? "Update expense" : "Save expense"}
                </button>

                {editingExpenseId ? (
                  <button type="button" className="ghost-button subtle-button" onClick={handleEditCancel}>
                    Cancel edit
                  </button>
                ) : null}
              </div>

              {statusMessage ? <p className="status-message success">{statusMessage}</p> : null}
              {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
            </form>

            <section className="card filter-card expenses-filter-card">
              <div className="section-heading">
                <h2>Expense view</h2>
                <p>These filters apply only to your expense list below.</p>
              </div>

              <div className="filter-grid filter-grid-wide">
                <label>
                  <span>Category</span>
                  <select value={selectedCategory} disabled={!currentUser} onChange={(event) => setSelectedCategory(event.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Sort</span>
                  <select value={sortNewestFirst ? "date_desc" : "none"} disabled={!currentUser} onChange={(event) => setSortNewestFirst(event.target.value === "date_desc")}>
                    <option value="date_desc">Newest first</option>
                    <option value="none">Created order</option>
                  </select>
                </label>

                <label>
                  <span>Range</span>
                  <select value={selectedTimeRange} disabled={!currentUser} onChange={(event) => setSelectedTimeRange(event.target.value as TimeRangeFilter)}>
                    <option value="all">All time</option>
                    <option value="week">This week</option>
                    <option value="month">This month</option>
                    <option value="year">This year</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="card list-card">
              <div className="list-card-heading">
                <div className="section-heading">
                  <h2>Your expenses</h2>
                  <p>Only the expenses tied to your authenticated account are returned by the API.</p>
                </div>

                <div className="list-card-tools">
                  <span className="list-selection-copy">
                    {selectedVisibleExpenseIds.length > 0 ? `${selectedVisibleExpenseIds.length} selected` : "Select expenses to delete together"}
                  </span>
                  <button
                    type="button"
                    className="table-action-button bulk-delete-button danger-button"
                    disabled={selectedVisibleExpenseIds.length === 0 || selectedVisibleExpenseIds.some((expenseId) => deletingExpenseIds.includes(expenseId))}
                    onClick={() => void handleDeleteSelectedExpenses()}
                  >
                    Delete selected
                  </button>
                </div>
              </div>

              {!currentUser && !authLoading ? <p className="empty-state">Sign in to view your private expense history.</p> : null}
              {currentUser && isLoading ? <p className="empty-state">Loading expenses...</p> : null}
              {currentUser && !isLoading && visibleExpenses.length === 0 ? <p className="empty-state">No expenses match the current filters.</p> : null}

              {currentUser && !isLoading && visibleExpenses.length > 0 ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={areAllVisibleExpensesSelected ? "Deselect all visible expenses" : "Select all visible expenses"}
                            checked={areAllVisibleExpensesSelected}
                            onChange={handleToggleSelectAllVisibleExpenses}
                          />
                        </th>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${expense.description}`}
                              checked={selectedExpenseIds.includes(expense.id)}
                              disabled={deletingExpenseIds.includes(expense.id)}
                              onChange={() => handleToggleExpenseSelection(expense.id)}
                            />
                          </td>
                          <td>{expense.date}</td>
                          <td>
                            <div className="expense-category-cell">
                              <span className="expense-category-icon">
                                <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                              </span>
                              <span>{expense.category}</span>
                            </div>
                          </td>
                          <td>{expense.description}</td>
                          <td>{formatCurrency(expense.amount)}</td>
                          <td>
                            <div className="table-actions">
                              <button type="button" className="table-action-button" onClick={() => handleEditStart(expense)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="table-action-button danger-button"
                                disabled={deletingExpenseIds.includes(expense.id)}
                                onClick={() => void handleDeleteExpense(expense.id)}
                              >
                                {deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </section>
        </>
      )}
    </main>
  );
}