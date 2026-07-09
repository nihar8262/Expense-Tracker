import { useCallback, useEffect, useMemo, useRef, useState, Component } from "react";
import type { ReactNode } from "react";
import { updateProfile, type User } from "firebase/auth";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth, providerOptions } from "../hooks/useAuth";
import { useBudgets } from "../hooks/useBudgets";
import { useExpenses } from "../hooks/useExpenses";
import { useNotifications } from "../hooks/useNotifications";
import { useWallets } from "../hooks/useWallets";
import { SignedInLayout } from "../layouts/SignedInLayout";
import { AlertsPage } from "../pages/AlertsPage";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { LandingPage } from "../pages/LandingPage";
import { WalletsPage } from "../pages/WalletsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { cn } from "../components/ui";
import type {
  BillReminder,
  BillReminderRecurrence,
  Budget,
  BudgetForm,
  BudgetHistoryGroup,
  BudgetHistoryRange,
  BudgetSummary,
  CategoryOption,
  ChartDisplayType,
  ChartGranularity,
  DashboardInsight,
  DashboardStats,
  Expense,
  ExpenseForm,
  Notification,
  ReminderPreferences,
  SplitRule,
  TimeRangeFilter,
  TrendDetailItem,
  TrendPoint,
  Wallet,
  WalletDetail
} from "../types";
import { ApiError } from "../types";
import { deleteAccountData } from "../services/api";
import {
  defaultCategoryOptions,
  resolveCategoryIcon,
  slugifyCategoryLabel,
  suggestFaIcon
} from "../utils/categories";
import {
  getCurrentMonthValue,
  getExpenseMonth,
  getIsoDateString,
  getMonthValueWithOffset,
  getStartOfWeek,
  getTodayIsoDate
} from "../utils/date";
import { formatBudgetMonth } from "../utils/format";
import {
  clearCustomCategories,
  readCustomCategories,
  readPendingSubmission,
  writeCustomCategories,
  writePendingSubmission
} from "../utils/storage";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

declare global {
  interface Window {
    showToast?: (message: string, type?: "success" | "error" | "info") => void;
  }
}

const EXPENSES_PAGE_SIZE = 25;

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

// ── Error boundary to surface render crashes instead of showing a blank page ──
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-10 text-amber-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
          <p className="text-sm text-secondary max-w-sm">{this.state.error.message}</p>
          <button
            type="button"
            className="ui-button-secondary mt-2"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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

  // Exact YYYY-MM calendar month match (new month picker)
  if (/^\d{4}-\d{2}$/.test(timeRange)) {
    return expenseDate.slice(0, 7) === timeRange;
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

export function AppRoutes() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((current) => [...current, { id, type, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 10000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    window.showToast = addToast;
    return () => {
      delete window.showToast;
    };
  }, [addToast]);
  const { authLoading, currentUser, authMessage, setAuthMessage, setCurrentUser, signIn, signOutCurrentUser } = useAuth();
  const { listExpenses, createExpense, updateExpense, deleteExpense } = useExpenses();
  const { listBudgets, createBudget, updateBudget, deleteBudget } = useBudgets();
  const {
    listWallets,
    getWalletDetail,
    createWallet,
    updateWallet,
    deleteWalletGroup,
    leaveWalletGroup,
    addWalletMember,
    removeWalletMember,
    createWalletBudget,
    updateWalletBudget,
    deleteWalletBudget,
    createSharedWalletExpense,
    updateSharedWalletExpense,
    deleteSharedWalletExpense,
    createWalletSettlement,
    updateWalletSettlementEntry,
    deleteWalletSettlementEntry
  } = useWallets();
  const {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    runNotificationChecks,
    respondToWalletInvite,
    listBillReminders,
    saveBillReminder,
    deleteBillReminderEntry,
    getReminderPreferences,
    updateReminderPreferences,
    getWalletReminderPreferences,
    updateWalletReminderPreferences
  } = useNotifications();
  const [form, setForm] = useState<ExpenseForm>(initialFormState);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(initialBudgetFormState);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [billReminders, setBillReminders] = useState<BillReminder[]>([]);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreferences | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const getCurrencySymbol = useCallback((code: string = "INR") => {
    const symbols: Record<string, string> = {
      USD: "$",
      EUR: "€",
      GBP: "£",
      INR: "₹",
      JPY: "¥",
      CAD: "C$",
      AUD: "A$",
      CHF: "Fr",
      CNY: "元",
      SGD: "S$",
      NZD: "NZ$"
    };
    return symbols[code.toUpperCase()] || "$";
  }, []);

  const formatCurrency = useCallback((amount: string, customCurrency?: string): string => {
    const value = Number(amount);
    const currency = customCurrency || reminderPreferences?.default_currency || "INR";

    let locale = "en-IN";
    if (currency === "USD") locale = "en-US";
    else if (currency === "EUR") locale = "de-DE";
    else if (currency === "GBP") locale = "en-GB";
    else if (currency === "JPY") locale = "ja-JP";
    else if (currency === "CAD") locale = "en-CA";
    else if (currency === "AUD") locale = "en-AU";
    else locale = "en-US";

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
  }, [reminderPreferences?.default_currency]);

  async function handleUpdateProfile(displayName: string, photoURL: string): Promise<void> {
    if (!currentUser || !reminderPreferences) {
      throw new Error("You must be logged in to update your profile.");
    }
    setIsUpdatingProfile(true);
    try {
      const updatedPrefs = {
        ...reminderPreferences,
        display_name: displayName,
        photo_url: photoURL
      };

      const resultPrefs = await updateReminderPreferences(currentUser, updatedPrefs);
      setReminderPreferences(resultPrefs);

      const firebasePhotoURL = photoURL.startsWith("data:") ? (currentUser.providerData?.find(p => p.photoURL)?.photoURL || "") : photoURL;
      await updateProfile(currentUser, { displayName, photoURL: firebasePhotoURL });

      // Shallow clone Firebase User object preserving all prototype methods (e.g. getIdToken)
      const clonedUser = Object.assign(Object.create(Object.getPrototypeOf(currentUser)), currentUser);
      clonedUser.displayName = displayName;
      clonedUser.photoURL = firebasePhotoURL;
      setCurrentUser(clonedUser);

      addToast("Profile details updated successfully.", "success");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to update profile.";
      setAuthMessage(errMsg);
      addToast(errMsg, "error");
      throw error;
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  const [preferenceScope, setPreferenceScope] = useState<string>("personal");
  const [walletPreferences, setWalletPreferences] = useState<Record<string, { budget_alerts_enabled: boolean; budget_alert_threshold: number }>>({});
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRangeFilter>("all");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("monthly");
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>("area");
  const [budgetHistoryRange, setBudgetHistoryRange] = useState<BudgetHistoryRange>("half-year");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [currentExpensesPage, setCurrentExpensesPage] = useState(1);
  const [walletExpenseOffset, setWalletExpenseOffset] = useState(0);
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
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedWallet, _setSelectedWallet] = useState<WalletDetail | null>(null);

  const setSelectedWallet = useCallback((val: WalletDetail | null | ((prev: WalletDetail | null) => WalletDetail | null)) => {
    _setSelectedWallet((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      if (next && dashboardWalletId === next.wallet.id) {
        setDashboardWallet(next);
      }
      return next;
    });
  }, [dashboardWalletId]);
  const [isSavingReminderPreferences, setIsSavingReminderPreferences] = useState(false);
  const [isSavingBillReminder, setIsSavingBillReminder] = useState(false);
  const [isRunningNotificationChecks, setIsRunningNotificationChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [budgetErrorMessage, setBudgetErrorMessage] = useState("");
  const [budgetStatusMessage, setBudgetStatusMessage] = useState("");
  const [walletErrorMessage, setWalletErrorMessage] = useState("");
  const [walletStatusMessage, setWalletStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
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
      created_at: walletExpense.created_at,
      platform: walletExpense.platform
    }));
  }, [dashboardViewMode, dashboardWallet, expenses]);

  const dashboardCategories = useMemo(
    () => [...new Set(dashboardExpenses.map((e) => e.category))].sort((l, r) => l.localeCompare(r)),
    [dashboardExpenses]
  );

  const visibleExpenses = useMemo(() => {
    return expenses
      .filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange))
      .filter((expense) => {
        if (!selectedPlatform) return true;
        if (selectedPlatform === "none") return !expense.platform;
        return expense.platform === selectedPlatform;
      });
  }, [expenses, selectedTimeRange, selectedPlatform]);

  const dashboardVisibleExpenses = useMemo(() => {
    return dashboardExpenses
      .filter((expense) => isExpenseInTimeRange(expense.date, selectedTimeRange))
      .filter((expense) => {
        if (!selectedPlatform) return true;
        if (selectedPlatform === "none") return !expense.platform;
        return expense.platform === selectedPlatform;
      });
  }, [dashboardExpenses, selectedTimeRange, selectedPlatform]);
  const totalExpensePages = Math.max(1, Math.ceil(visibleExpenses.length / EXPENSES_PAGE_SIZE));
  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentExpensesPage - 1) * EXPENSES_PAGE_SIZE;
    return visibleExpenses.slice(startIndex, startIndex + EXPENSES_PAGE_SIZE);
  }, [currentExpensesPage, visibleExpenses]);
  const allFilteredExpenseIds = useMemo(() => visibleExpenses.map((expense) => expense.id), [visibleExpenses]);
  const allVisibleExpenseIds = useMemo(() => paginatedExpenses.map((expense) => expense.id), [paginatedExpenses]);
  const selectedVisibleExpenseIds = useMemo(() => allVisibleExpenseIds.filter((expenseId) => selectedExpenseIds.includes(expenseId)), [allVisibleExpenseIds, selectedExpenseIds]);
  const areAllVisibleExpensesSelected = allVisibleExpenseIds.length > 0 && selectedVisibleExpenseIds.length === allVisibleExpenseIds.length;

  // Derive sorted unique YYYY-MM month strings from all expenses for the month picker
  const expenseMonthOptions = useMemo(() => {
    const months = [...new Set(expenses.map((e) => e.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
    return months;
  }, [expenses]);

  const spendTrend = useMemo(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet) {
      return buildTrendPoints(dashboardVisibleExpenses, chartGranularity);
    }

    if (chartGranularity === "monthly" && dashboardWallet.walletAggregation?.monthly_totals) {
      const today = new Date();
      const currentYear = today.getFullYear().toString();

      let filteredTotals = dashboardWallet.walletAggregation.monthly_totals;
      if (selectedTimeRange === "year") {
        filteredTotals = filteredTotals.filter(m => m.month.startsWith(currentYear));
      }

      return filteredTotals.map(m => {
        const [year, monthNum] = m.month.split("-").map(Number);
        const parsedDate = new Date(year, monthNum - 1, 1);
        const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(parsedDate);
        const shortLabel = new Intl.DateTimeFormat("en-IN", { month: "short" }).format(parsedDate);
        return {
          key: m.month,
          label,
          shortLabel,
          total: Number(m.total),
          count: m.count,
          order: parsedDate.getTime()
        };
      });
    }

    return buildTrendPoints(dashboardVisibleExpenses, chartGranularity);
  }, [dashboardViewMode, dashboardWallet, dashboardVisibleExpenses, chartGranularity, selectedTimeRange]);

  const trendDetailLookup = useMemo(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet) {
      return buildTrendDetailLookup(dashboardVisibleExpenses, chartGranularity);
    }
    return buildTrendDetailLookup(dashboardWallet.expenses, chartGranularity);
  }, [dashboardViewMode, dashboardWallet, dashboardVisibleExpenses, chartGranularity]);

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

  const totalVal = useMemo(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet || !dashboardWallet.walletAggregation) {
      return dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0).toFixed(2);
    }
     
    const today = new Date();
    const currentYear = today.getFullYear().toString();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
     
    if (selectedTimeRange === "all") {
      return Number(dashboardWallet.walletAggregation.total_amount).toFixed(2);
    } else if (selectedTimeRange === "month") {
      const monthData = dashboardWallet.walletAggregation.monthly_totals.find(m => m.month === currentMonthStr);
      return Number(monthData?.total ?? 0).toFixed(2);
    } else if (selectedTimeRange === "year") {
      const yearTotal = dashboardWallet.walletAggregation.monthly_totals
        .filter(m => m.month.startsWith(currentYear))
        .reduce((sum, m) => sum + Number(m.total), 0);
      return yearTotal.toFixed(2);
    } else {
      return dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0).toFixed(2);
    }
  }, [dashboardViewMode, dashboardWallet, dashboardVisibleExpenses, selectedTimeRange]);

  const total = useMemo(() => {
    const currency = (dashboardViewMode === "wallet" && dashboardWallet) ? dashboardWallet.wallet.currency : undefined;
    return formatCurrency(totalVal, currency);
  }, [totalVal, dashboardViewMode, dashboardWallet, formatCurrency]);

  const dashboardStats = useMemo<DashboardStats>(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet || !dashboardWallet.walletAggregation) {
      const expenseCount = dashboardVisibleExpenses.length;
      const rawTotal = dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const average = expenseCount > 0 ? rawTotal / expenseCount : 0;

      const categoryTotals = dashboardVisibleExpenses.reduce<Record<string, number>>((accumulator, expense) => {
        accumulator[expense.category] = (accumulator[expense.category] ?? 0) + Number(expense.amount);
        return accumulator;
      }, {});

      const categoryBreakdown = Object.entries(categoryTotals)
        .sort((left, right) => right[1] - left[1])
        .map(([category, amount]) => {
          const platforms = Array.from(
            new Set(
              dashboardVisibleExpenses
                .filter((e) => e.category === category)
                .map((e) => e.platform || "others")
            )
          );
          return {
            category,
            amount,
            formattedAmount: formatCurrency(amount.toFixed(2)),
            share: rawTotal > 0 ? (amount / rawTotal) * 100 : 0,
            platforms
          };
        });

      const latestExpense = [...dashboardVisibleExpenses].sort((left, right) => {
        const byDate = right.date.localeCompare(left.date);
        return byDate !== 0 ? byDate : right.created_at.localeCompare(left.created_at);
      })[0] ?? null;

      const platformTotals = dashboardVisibleExpenses.reduce<Record<string, number>>((accumulator, expense) => {
        if (expense.platform) {
          accumulator[expense.platform] = (accumulator[expense.platform] ?? 0) + Number(expense.amount);
        }
        return accumulator;
      }, {});

      const sortedPlatforms = Object.entries(platformTotals).sort((left, right) => right[1] - left[1]);
      const topPlatform = sortedPlatforms[0] ? {
        platform: sortedPlatforms[0][0],
        amount: sortedPlatforms[0][1],
        formattedAmount: formatCurrency(sortedPlatforms[0][1].toFixed(2))
      } : null;

      return {
        expenseCount,
        average: formatCurrency(average.toFixed(2)),
        topCategory: categoryBreakdown[0] ?? null,
        latestExpense,
        categoryBreakdown,
        topPlatform
      };
    }

    const agg = dashboardWallet.walletAggregation;
    let activeCategories = agg.category_totals;
    let expenseCount = agg.expense_count;
    let rawTotal = Number(agg.total_amount);
    
    const today = new Date();
    const currentYear = today.getFullYear().toString();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    
    if (selectedTimeRange === "month") {
      const currentMonthExpenses = dashboardWallet.expenses.filter(e => e.date.startsWith(currentMonthStr));
      expenseCount = currentMonthExpenses.length;
      rawTotal = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      
      const categoryTotals: Record<string, number> = {};
      for (const e of currentMonthExpenses) {
        categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
      }
      activeCategories = Object.entries(categoryTotals).map(([category, amount]) => ({
        category,
        total: amount.toFixed(2),
        count: 0
      })).sort((a, b) => Number(b.total) - Number(a.total));
    } else if (selectedTimeRange === "year") {
      const currentYearExpenses = dashboardWallet.expenses.filter(e => e.date.startsWith(currentYear));
      expenseCount = currentYearExpenses.length;
      rawTotal = currentYearExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      
      const categoryTotals: Record<string, number> = {};
      for (const e of currentYearExpenses) {
        categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
      }
      activeCategories = Object.entries(categoryTotals).map(([category, amount]) => ({
        category,
        total: amount.toFixed(2),
        count: 0
      })).sort((a, b) => Number(b.total) - Number(a.total));
    } else if (selectedTimeRange === "week") {
      expenseCount = dashboardVisibleExpenses.length;
      rawTotal = dashboardVisibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      
      const categoryTotals: Record<string, number> = {};
      for (const e of dashboardVisibleExpenses) {
        categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
      }
      activeCategories = Object.entries(categoryTotals).map(([category, amount]) => ({
        category,
        total: amount.toFixed(2),
        count: 0
      })).sort((a, b) => Number(b.total) - Number(a.total));
    }

    const average = expenseCount > 0 ? rawTotal / expenseCount : 0;

    const categoryBreakdown = activeCategories.map((c) => {
      const amt = Number(c.total);
      const platforms = c.platforms && c.platforms.length > 0
        ? c.platforms
        : Array.from(
            new Set(
              dashboardWallet.expenses
                .filter((e) => e.category === c.category)
                .map((e) => e.platform || "others")
            )
          );
      const platformShares = c.platform_shares && c.platform_shares.length > 0
        ? c.platform_shares.map(p => ({ platform: p.platform, amount: Number(p.total) }))
        : undefined;
      return {
        category: c.category,
        amount: amt,
        formattedAmount: formatCurrency(amt.toFixed(2), dashboardWallet.wallet.currency),
        share: rawTotal > 0 ? (amt / rawTotal) * 100 : 0,
        platforms,
        platformShares
      };
    });

    const latestExpense = dashboardWallet.expenses[0] ?? null;

    const platformTotals = dashboardWallet.expenses.reduce<Record<string, number>>((accumulator, expense) => {
      if (expense.platform) {
        accumulator[expense.platform] = (accumulator[expense.platform] ?? 0) + Number(expense.amount);
      }
      return accumulator;
    }, {});

    const sortedPlatforms = Object.entries(platformTotals).sort((left, right) => right[1] - left[1]);
    const topPlatform = sortedPlatforms[0] ? {
      platform: sortedPlatforms[0][0],
      amount: sortedPlatforms[0][1],
      formattedAmount: formatCurrency(sortedPlatforms[0][1].toFixed(2), dashboardWallet.wallet.currency)
    } : null;

    return {
      expenseCount,
      average: formatCurrency(average.toFixed(2), dashboardWallet.wallet.currency),
      topCategory: categoryBreakdown[0] ?? null,
      latestExpense,
      categoryBreakdown,
      topPlatform
    };
  }, [dashboardViewMode, dashboardWallet, dashboardVisibleExpenses, selectedTimeRange, formatCurrency]);

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
  }, [budgets, expenses, formatCurrency]);

  const currentBudgetMonth = getCurrentMonthValue();

  const dashboardBudgetSummaries = useMemo<BudgetSummary[]>(() => {
    if (dashboardViewMode === "personal" || !dashboardWallet || !dashboardWallet.walletAggregation) {
      return budgetSummaries;
    }

    return dashboardWallet.budgets
      .map((budget) => {
        const spent = dashboardWallet.walletAggregation.budget_totals
          .filter((entry) => entry.month === budget.month)
          .filter((entry) => (budget.scope === "category" ? entry.category === budget.category : true))
          .reduce((sum, entry) => sum + Number(entry.total), 0);
        const totalBudgetAmount = Number(budget.amount);
        const remaining = totalBudgetAmount - spent;

        return {
          ...budget,
          spent,
          remaining,
          formattedAmount: formatCurrency(budget.amount, dashboardWallet.wallet.currency),
          formattedSpent: formatCurrency(spent.toFixed(2), dashboardWallet.wallet.currency),
          formattedRemaining: formatCurrency(remaining.toFixed(2), dashboardWallet.wallet.currency),
          isOverspent: remaining < 0
        };
      })
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);
        if (byMonth !== 0) return byMonth;
        if (left.scope !== right.scope) return left.scope === "monthly" ? -1 : 1;
        return (left.category ?? "").localeCompare(right.category ?? "");
      });
  }, [dashboardViewMode, dashboardWallet, budgetSummaries, formatCurrency]);

  const dashboardCurrentMonthBudgetSummaries = useMemo(() => dashboardBudgetSummaries.filter((budget) => budget.month === currentBudgetMonth), [dashboardBudgetSummaries, currentBudgetMonth]);

  const dashboardCurrentMonthBudgetOverview = useMemo(() => {
    const totalBudgetAmount = dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + Number(budget.amount), 0);
    const totalSpentAmount = dashboardCurrentMonthBudgetSummaries.reduce((sum, budget) => sum + budget.spent, 0);
    const totalRemainingAmount = totalBudgetAmount - totalSpentAmount;

    const targetCurrency = dashboardViewMode === "wallet" && dashboardWallet ? dashboardWallet.wallet.currency : undefined;

    return {
      totalBudget: formatCurrency(totalBudgetAmount.toFixed(2), targetCurrency),
      totalSpent: formatCurrency(totalSpentAmount.toFixed(2), targetCurrency),
      totalRemaining: formatCurrency(totalRemainingAmount.toFixed(2), targetCurrency),
      isOverspent: totalRemainingAmount < 0
    };
  }, [dashboardCurrentMonthBudgetSummaries, dashboardViewMode, dashboardWallet, formatCurrency]);

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
  }, [currentBudgetMonth, dashboardCurrentMonthBudgetSummaries, dashboardStats, dashboardExpenses, selectedCategory, formatCurrency]);

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
      setExpenses(await listExpenses(user, activeCategory, activeSort));
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
      setBudgets(await listBudgets(user));
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
      const walletEntries = await listWallets(user);
      setWallets(walletEntries);
      setSelectedWalletId((current) => {
        if (current && walletEntries.some((wallet) => wallet.id === current)) {
          return current;
        }

        return walletEntries[0]?.id ?? null;
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
      setNotifications(await listNotifications(user));
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
      setReminderPreferences(await getReminderPreferences(user));
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to load reminder preferences.");
      setReminderPreferences({
        daily_logging_enabled: true,
        daily_logging_hour: 20,
        budget_alerts_enabled: true,
        budget_alert_threshold: 80,
        default_currency: "INR",
        default_timezone: "UTC",
        updated_at: new Date().toISOString()
      });
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
    setIsProfileMenuOpen(false);
    setIsNotificationPanelOpen(false);
    setIsDeleteAccountModalOpen(false);

    if (!currentUser) {
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

    setCustomCategories(readCustomCategories(currentUser.uid));
  }, [currentUser]);

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
    if (!currentUser) return;
    const handleExpenseAdded = () => {
      void loadExpenses(currentUser, selectedCategory, sortNewestFirst);
    };
    window.addEventListener("expense-added", handleExpenseAdded);
    return () => window.removeEventListener("expense-added", handleExpenseAdded);
  }, [currentUser, selectedCategory, sortNewestFirst]);

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
    setWalletExpenseOffset(0);
    if (!currentUser || !selectedWalletId) {
      setSelectedWallet(null);
      return;
    }

    void loadSelectedWallet(currentUser, selectedWalletId);
  }, [currentUser, selectedWalletId]);

  useEffect(() => {
    if (!currentUser || !dashboardWalletId || dashboardViewMode !== "wallet") {
      return;
    }
    // Only fetch if we don't have the current wallet loaded
    if (dashboardWallet && dashboardWallet.wallet.id === dashboardWalletId) {
      return;
    }
    getWalletDetail(dashboardWalletId, currentUser).then(setDashboardWallet).catch(() => setDashboardWallet(null));
  }, [currentUser, dashboardViewMode, dashboardWalletId, dashboardWallet]);

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

  useEffect(() => {
    if (statusMessage) {
      addToast(statusMessage, "success");
      setStatusMessage("");
    }
  }, [statusMessage, addToast]);

  useEffect(() => {
    if (errorMessage) {
      addToast(errorMessage, "error");
      setErrorMessage("");
    }
  }, [errorMessage, addToast]);

  useEffect(() => {
    if (walletStatusMessage) {
      addToast(walletStatusMessage, "success");
      setWalletStatusMessage("");
    }
  }, [walletStatusMessage, addToast]);

  useEffect(() => {
    if (walletErrorMessage) {
      addToast(walletErrorMessage, "error");
      setWalletErrorMessage("");
    }
  }, [walletErrorMessage, addToast]);

  useEffect(() => {
    if (budgetStatusMessage) {
      addToast(budgetStatusMessage, "success");
      setBudgetStatusMessage("");
    }
  }, [budgetStatusMessage, addToast]);

  useEffect(() => {
    if (budgetErrorMessage) {
      addToast(budgetErrorMessage, "error");
      setBudgetErrorMessage("");
    }
  }, [budgetErrorMessage, addToast]);

  useEffect(() => {
    if (authMessage) {
      const isError = authMessage.toLowerCase().includes("fail") || authMessage.toLowerCase().includes("error") || authMessage.toLowerCase().includes("invalid");
      addToast(authMessage, isError ? "error" : "success");
      setAuthMessage("");
    }
  }, [authMessage, addToast, setAuthMessage]);

  async function handleSignOut() {
    await signOutCurrentUser();
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
      await signOutCurrentUser();
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

  async function handleCreateWallet(input: { name: string; description: string; defaultSplitRule: SplitRule; currency?: string; members: Array<{ displayName: string; email?: string }> }) {
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

  async function handleUpdateWallet(walletId: string, input: { name: string; description: string; defaultSplitRule: SplitRule; currency?: string; members: Array<{ displayName: string; email?: string }> }) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to edit a shared wallet.");
      return false;
    }

    startWalletSubmit("update-wallet");

    try {
      const wallet = await updateWallet(walletId, input, currentUser);
      await loadWallets(currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Wallet updated.");
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to update wallet.");
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
      setWalletExpenseOffset(0);
      await loadWallets(currentUser);
      setSelectedWallet(wallet);
      setWalletStatusMessage("Shared expense added.");
      void loadNotifications(currentUser);
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
      await updateSharedWalletExpense(inputWalletId, walletExpenseId, input, currentUser);
      const limit = walletExpenseOffset + 50;
      const wallet = await getWalletDetail(inputWalletId, currentUser, 0, limit);
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



  async function handleDeleteWalletExpenses(inputWalletId: string, walletExpenseIds: string[]) {
    if (!currentUser) {
      setWalletErrorMessage("Sign in to delete shared expenses.");
      return false;
    }

    startWalletSubmit("expense");

    try {
      for (const expenseId of walletExpenseIds) {
        await deleteSharedWalletExpense(inputWalletId, expenseId, currentUser);
      }
      const limit = walletExpenseOffset + 50;
      const wallet = await getWalletDetail(inputWalletId, currentUser, 0, limit);
      setSelectedWallet(wallet);
      setWalletStatusMessage(`${walletExpenseIds.length} shared ${walletExpenseIds.length === 1 ? "expense" : "expenses"} deleted.`);
      return true;
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to delete shared expenses.");
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
      setWalletExpenseOffset(0);
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
      await updateWalletSettlementEntry(inputWalletId, settlementId, input, currentUser);
      const limit = walletExpenseOffset + 50;
      const wallet = await getWalletDetail(inputWalletId, currentUser, 0, limit);
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
      await deleteWalletSettlementEntry(inputWalletId, settlementId, currentUser);
      const limit = walletExpenseOffset + 50;
      const wallet = await getWalletDetail(inputWalletId, currentUser, 0, limit);
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

  async function handleLoadMoreWalletExpenses() {
    if (!currentUser || !selectedWalletId || !selectedWallet) {
      return;
    }

    const nextOffset = walletExpenseOffset + 50;
    try {
      setIsWalletLoading(true);
      const moreData = await getWalletDetail(selectedWalletId, currentUser, nextOffset);
      setSelectedWallet((prev) => prev ? {
        ...prev,
        expenses: [...prev.expenses, ...moreData.expenses],
        expensePagination: moreData.expensePagination
      } : null);
      setWalletExpenseOffset(nextOffset);
    } catch (error) {
      setWalletErrorMessage(error instanceof Error ? error.message : "Failed to load more expenses.");
      throw error;
    } finally {
      setIsWalletLoading(false);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    if (!currentUser) {
      return;
    }

    try {
      const updatedNotification = await markNotificationRead(notificationId, currentUser);
      setNotifications((current) => current.map((notification) => (notification.id === notificationId ? updatedNotification : notification)));
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to update notification.");
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!currentUser) {
      return;
    }

    try {
      await markAllNotificationsRead(currentUser);
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
      setAuthMessage(action === "accept" ? "Invite accepted â€” you have been added to the group." : "Invite declined.");
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

  async function handlePreferenceScopeChange(scope: string) {
    setPreferenceScope(scope);
    if (scope !== "personal" && currentUser && !walletPreferences[scope]) {
      setIsSavingReminderPreferences(true);
      try {
        const prefs = await getWalletReminderPreferences(scope, currentUser);
        setWalletPreferences((prev) => ({
          ...prev,
          [scope]: prefs
        }));
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : "Failed to load wallet preferences.");
      } finally {
        setIsSavingReminderPreferences(false);
      }
    }
  }

  const activeReminderPreferences = useMemo(() => {
    if (preferenceScope === "personal") {
      return reminderPreferences;
    }
    const walletPrefs = walletPreferences[preferenceScope];
    if (!walletPrefs) {
      return {
        daily_logging_enabled: false,
        daily_logging_hour: 0,
        budget_alerts_enabled: true,
        budget_alert_threshold: 80,
        default_currency: "INR",
        default_timezone: "UTC",
        updated_at: ""
      };
    }
    return {
      daily_logging_enabled: false,
      daily_logging_hour: 0,
      budget_alerts_enabled: walletPrefs.budget_alerts_enabled,
      budget_alert_threshold: walletPrefs.budget_alert_threshold,
      default_currency: "INR",
      default_timezone: "UTC",
      updated_at: ""
    };
  }, [preferenceScope, reminderPreferences, walletPreferences]);

  function handleReminderPreferencesChange(
    field: "daily_logging_enabled" | "daily_logging_hour" | "budget_alerts_enabled" | "budget_alert_threshold" | "default_currency" | "default_timezone",
    value: boolean | number | string
  ) {
    if (preferenceScope !== "personal") {
      setWalletPreferences((current) => {
        const prev = current[preferenceScope] || { budget_alerts_enabled: true, budget_alert_threshold: 80 };
        return {
          ...current,
          [preferenceScope]: {
            ...prev,
            [field === "budget_alerts_enabled" ? "budget_alerts_enabled" : "budget_alert_threshold"]: value as any
          }
        };
      });
      return;
    }

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
    if (!currentUser) {
      return;
    }

    if (preferenceScope !== "personal") {
      const prefs = walletPreferences[preferenceScope];
      if (!prefs) return;
      setIsSavingReminderPreferences(true);
      try {
        const updated = await updateWalletReminderPreferences(preferenceScope, currentUser, prefs);
        setWalletPreferences((current) => ({
          ...current,
          [preferenceScope]: updated
        }));
        addToast("Wallet reminder preferences updated successfully.", "success");
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : "Failed to update wallet preferences.");
      } finally {
        setIsSavingReminderPreferences(false);
      }
      return;
    }

    if (!reminderPreferences) {
      return;
    }

    setIsSavingReminderPreferences(true);

    try {
      const oldCurrency = reminderPreferences.default_currency;
      const updated = await updateReminderPreferences(currentUser, reminderPreferences);
      setReminderPreferences(updated);
      addToast("Reminder preferences updated successfully.", "success");

      if (oldCurrency && updated.default_currency && oldCurrency.toUpperCase() !== updated.default_currency.toUpperCase()) {
        await Promise.all([
          loadExpenses(currentUser),
          loadBudgets(currentUser),
          loadWallets(currentUser)
        ]);
      }
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
      addToast(
        billReminderId
          ? "Bill reminder updated successfully."
          : "Bill reminder created successfully.",
        "success"
      );
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
      await loadNotifications(currentUser);
      setAuthMessage("");
      addToast("Bill reminder deleted successfully.", "success");
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
    setSelectedPlatform("");
    setSortNewestFirst(true);
  }

  function renderSignedInPage(page: "dashboard" | "expenses" | "wallets" | "alerts" | "profile") {
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
        wallets={wallets}
        preferenceScope={preferenceScope}
        onPreferenceScopeChange={handlePreferenceScopeChange}
        unreadNotificationCount={unreadNotificationCount}
        reminderPreferences={activeReminderPreferences}
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
          <ErrorBoundary>
            <DashboardPage
            activeExpenses={dashboardVisibleExpenses}
            categories={dashboardViewMode === "wallet" ? dashboardCategories : categories}
            dashboardInsights={dashboardInsights}
            wallets={wallets}
            dashboardViewMode={dashboardViewMode}
            dashboardWalletId={dashboardWalletId}
            currencySymbol={getCurrencySymbol(reminderPreferences?.default_currency)}
            onDashboardViewModeChange={(mode) => { setDashboardViewMode(mode); setSelectedCategory(""); setSelectedPlatform(""); if (mode === "personal") { setDashboardWalletId(null); } else if (wallets.length > 0 && !dashboardWalletId) { setDashboardWalletId(wallets[0].id); } }}
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
            selectedPlatform={selectedPlatform}
            onSelectedPlatformChange={setSelectedPlatform}
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
          </ErrorBoundary>
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
              selectedPlatform={selectedPlatform}
              sortNewestFirst={sortNewestFirst}
              categories={categories}
              expenseMonthOptions={expenseMonthOptions}
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
              currencySymbol={getCurrencySymbol(reminderPreferences?.default_currency)}
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
              onSelectedPlatformChange={setSelectedPlatform}
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
              currencySymbol={selectedWallet ? getCurrencySymbol(selectedWallet.wallet.currency) : getCurrencySymbol(reminderPreferences?.default_currency)}
              onSelectWallet={setSelectedWalletId}
              onCreateWallet={handleCreateWallet}
              onUpdateWallet={handleUpdateWallet}
              onDeleteWallet={handleDeleteWallet}
              onLeaveWallet={handleLeaveWallet}
              onAddWalletMember={handleAddWalletMember}
              onRemoveWalletMember={handleRemoveWalletMember}
              onCreateWalletExpense={handleCreateWalletExpense}
              onUpdateWalletExpense={handleUpdateWalletExpense}
              onDeleteWalletExpenses={handleDeleteWalletExpenses}
              onCreateWalletBudget={handleCreateWalletBudget}
              onUpdateWalletBudget={handleUpdateWalletBudget}
              onDeleteWalletBudget={handleDeleteWalletBudget}
              onCreateWalletSettlement={handleCreateWalletSettlement}
              onUpdateWalletSettlement={handleUpdateWalletSettlement}
              onDeleteWalletSettlement={handleDeleteWalletSettlement}
              onLoadMoreExpenses={handleLoadMoreWalletExpenses}
            />
          ) : page === "alerts" ? (
            <AlertsPage
              notifications={notifications}
              billReminders={billReminders}
              isSavingPreferences={isSavingReminderPreferences}
              isSavingBillReminder={isSavingBillReminder}
              isRunningChecks={isRunningNotificationChecks}
              preferences={activeReminderPreferences}
              wallets={wallets}
              preferenceScope={preferenceScope}
              onPreferenceScopeChange={handlePreferenceScopeChange}
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
          ) : (
            <ProfilePage
              currentUser={currentUser}
              reminderPreferences={reminderPreferences}
              isSavingReminderPreferences={isSavingReminderPreferences}
              onReminderPreferencesChange={handleReminderPreferencesChange}
              onSaveReminderPreferences={handleSaveReminderPreferences}
              onUpdateProfile={handleUpdateProfile}
              isUpdatingProfile={isUpdatingProfile}
              onOpenDeleteAccountModal={openDeleteAccountModal}
              isDeletingAccount={isDeletingAccount}
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
    <>
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
            <Route path="/profile" element={renderSignedInPage("profile")} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<LandingPage onCreateAccount={() => navigate("/signup")} onSignIn={() => navigate("/signin")} formatCurrency={formatCurrency} />} />
            <Route path="/signin" element={<AuthPage mode="signin" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={signIn} />} />
            <Route path="/signup" element={<AuthPage mode="signup" authLoading={authLoading} authMessage={authMessage} providerOptions={providerOptions} onBack={() => navigate("/")} onChangeMode={(mode) => navigate(mode === "signin" ? "/signin" : "/signup")} onSignIn={signIn} />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/expenses" element={<Navigate to="/" replace />} />
            <Route path="/wallets" element={<Navigate to="/" replace />} />
            <Route path="/alerts" element={<Navigate to="/" replace />} />
            <Route path="/profile" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>

      {/* Toasts Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start justify-between gap-3 rounded-[20px] border p-4 shadow-[0_20px_50px_rgba(0,0,0,0.12)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md transition-all duration-300 animate-slide-in",
              toast.type === "success"
                ? "border-emerald-500/20 text-emerald-950 dark:text-emerald-50"
                : toast.type === "error"
                ? "border-red-500/20 text-red-950 dark:text-red-50"
                : "border-zinc-500/20 text-zinc-950 dark:text-zinc-50"
            )}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {toast.type === "success" ? (
                <span className="text-emerald-500 mt-0.5 shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              ) : toast.type === "error" ? (
                <span className="text-red-500 mt-0.5 shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
              ) : (
                <span className="text-zinc-500 mt-0.5 shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              )}
              <p className="text-sm font-semibold leading-5 text-ink break-words">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 mt-0.5 transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}


