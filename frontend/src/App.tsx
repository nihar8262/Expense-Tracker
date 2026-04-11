import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthProvider, User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { auth, authPersistenceReady, facebookProvider, githubProvider, googleProvider, isFirebaseConfigured } from "./auth";
import { SignedInLayout } from "./layouts/SignedInLayout";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LandingPage } from "./pages/LandingPage";
import type { CategoryIconId, CategoryOption, ChartGranularity, DashboardStats, Expense, ExpenseForm, PendingSubmission, ProviderOption, TimeRangeFilter, TrendDetailItem, TrendPoint } from "./types";
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
  const url = API_BASE_URL ? new URL("/api/expenses", API_BASE_URL) : new URL("/api/expenses", window.location.origin);

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

function buildTrendDetailLookup(expenseItems: Expense[], granularity: ChartGranularity): Record<string, TrendDetailItem[]> {
  if (granularity !== "daily" && granularity !== "monthly") {
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
  const navigate = useNavigate();
  const [form, setForm] = useState<ExpenseForm>(initialFormState);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [customCategoryIcon, setCustomCategoryIcon] = useState<CategoryIconId>("other");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRangeFilter>("all");
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("monthly");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
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
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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

  const selectedCategoryOption = useMemo(() => availableCategoryOptions.find((option) => option.label.toLowerCase() === form.category.trim().toLowerCase()) ?? null, [availableCategoryOptions, form.category]);
  const isOtherCategorySelected = selectedCategoryOption?.id === "others";

  const visibleExpenses = useMemo(() => expenses.filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange)), [expenses, selectedTimeRange]);
  const allVisibleExpenseIds = useMemo(() => visibleExpenses.map((expense) => expense.id), [visibleExpenses]);
  const selectedVisibleExpenseIds = useMemo(() => allVisibleExpenseIds.filter((expenseId) => selectedExpenseIds.includes(expenseId)), [allVisibleExpenseIds, selectedExpenseIds]);
  const areAllVisibleExpensesSelected = allVisibleExpenseIds.length > 0 && selectedVisibleExpenseIds.length === allVisibleExpenseIds.length;

  const spendTrend = useMemo(() => buildTrendPoints(visibleExpenses, chartGranularity), [visibleExpenses, chartGranularity]);
  const trendDetailLookup = useMemo(() => buildTrendDetailLookup(visibleExpenses, chartGranularity), [visibleExpenses, chartGranularity]);

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

  const total = useMemo(() => formatCurrency(visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0).toFixed(2)), [visibleExpenses]);

  const dashboardStats = useMemo<DashboardStats>(() => {
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
        setEditingExpenseId(null);
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
    setIsProfileMenuOpen(false);
    setSelectedExpenseIds([]);
    setEditingExpenseId(null);
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
      setIsDeleteAccountModalOpen(false);
      setExpenses([]);
      setCustomCategories([]);
      setForm(initialFormState);
      setSelectedCategory("");
      setSelectedExpenseIds([]);
      setEditingExpenseId(null);
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
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        writePendingSubmission(null);
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderSignedInPage(page: "dashboard" | "expenses") {
    if (!currentUser) {
      return null;
    }

    return (
      <SignedInLayout
        currentUser={currentUser}
        isProfileMenuOpen={isProfileMenuOpen}
        profileMenuRef={profileMenuRef}
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        isDeletingAccount={isDeletingAccount}
        onToggleProfileMenu={() => setIsProfileMenuOpen((current) => !current)}
        onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
        onSignOut={handleSignOut}
        onOpenDeleteAccountModal={openDeleteAccountModal}
        onCloseDeleteAccountModal={closeDeleteAccountModal}
        onDeleteAccount={handleDeleteAccount}
      >
        {page === "dashboard" ? (
          <DashboardPage
            categories={categories}
            selectedCategory={selectedCategory}
            selectedTimeRange={selectedTimeRange}
            chartGranularity={chartGranularity}
            total={total}
            dashboardStats={dashboardStats}
            spendTrend={spendTrend}
            trendDetailLookup={trendDetailLookup}
            chartSummary={chartSummary}
            formatCurrency={formatCurrency}
            onSelectedCategoryChange={setSelectedCategory}
            onSelectedTimeRangeChange={setSelectedTimeRange}
            onChartGranularityChange={setChartGranularity}
          />
        ) : (
          <ExpensesPage
            currentUserPresent={Boolean(currentUser)}
            authLoading={authLoading}
            form={form}
            editingExpenseId={editingExpenseId}
            isSubmitting={isSubmitting}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            customCategoryName={customCategoryName}
            customCategoryIcon={customCategoryIcon}
            selectedCategory={selectedCategory}
            selectedTimeRange={selectedTimeRange}
            sortNewestFirst={sortNewestFirst}
            categories={categories}
            visibleExpenses={visibleExpenses}
            availableCategoryOptions={availableCategoryOptions}
            selectedCategoryOption={selectedCategoryOption}
            isOtherCategorySelected={isOtherCategorySelected}
            iconOptions={iconOptions}
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
            onCustomCategoryIconChange={setCustomCategoryIcon}
            onCreateCustomCategory={handleCreateCustomCategory}
            onSubmit={handleSubmit}
            onEditCancel={handleEditCancel}
            onSelectedCategoryChange={setSelectedCategory}
            onSortNewestFirstChange={setSortNewestFirst}
            onSelectedTimeRangeChange={setSelectedTimeRange}
            onDeleteSelectedExpenses={handleDeleteSelectedExpenses}
            onToggleSelectAllVisibleExpenses={handleToggleSelectAllVisibleExpenses}
            onToggleExpenseSelection={handleToggleExpenseSelection}
            onEditStart={handleEditStart}
            onDeleteExpense={handleDeleteExpense}
          />
        )}
      </SignedInLayout>
    );
  }

  if (authLoading) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-page-frame">
          <section className="card auth-panel auth-panel-minimal">
            <p className="empty-state">Checking your session...</p>
          </section>
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<LandingPage onCreateAccount={() => navigate("/signup")} onSignIn={() => navigate("/signin")} formatCurrency={formatCurrency} />} />
          <Route path="/signin" element={<AuthPage mode="signin" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={handleSignIn} />} />
          <Route path="/signup" element={<AuthPage mode="signup" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={handleSignIn} />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/expenses" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
