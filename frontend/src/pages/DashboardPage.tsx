import { useEffect, useRef, useState, useMemo } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { EmptyState, SectionHeader, SurfaceCard, ModalFrame, cn } from "../components/ui";
import { TrendChart } from "../components/TrendChart";
import { FilterDropdown } from "../components/FilterDropdown";
import { CategoryIcon } from "../components/CategoryIcon";
import { useNavigate } from "react-router-dom";
import { PLATFORMS } from "../lib/platforms";
import { PlatformLogo } from "../components/PlatformPicker";
import { BankLogo, BankCardBadge } from "../components/BankPicker";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { formatBudgetMonth } from "../utils/format";
import { useAuth } from "../hooks/useAuth";
import { listBankAccounts } from "../services/api";
import {
  User as UserIcon,
  Wallet as WalletIcon,
  TrendingUp,
  Plus,
  CreditCard,
  Receipt,
  BarChart3,
  Tag,
  Store,
  Lightbulb
} from "lucide-react";
import type {
  BankAccount,
  BankAccountType,
  BudgetForm,
  BudgetHistoryGroup,
  BudgetHistoryRange,
  BudgetSummary,
  CategoryOption,
  ChartDisplayType,
  ChartGranularity,
  ChartSummary,
  DashboardInsight,
  DashboardStats,
  Expense,
  TimeRangeFilter,
  TrendDetailItem,
  TrendPoint,
  Wallet,
  WalletDetail
} from "../types";

type DashboardPageProps = {
  categories: string[];
  wallets: Wallet[];
  dashboardViewMode: "personal" | "wallet";
  dashboardWalletId: string | null;
  dashboardWallet?: WalletDetail | null;
  isDashboardLoading?: boolean;
  onDashboardViewModeChange: (mode: "personal" | "wallet") => void;
  onDashboardWalletIdChange: (walletId: string) => void;
  dashboardInsights: DashboardInsight[];
  budgetForm: BudgetForm;
  budgetCategoryOptions: CategoryOption[];
  currentBudgetMonthLabel: string;
  currentMonthBudgetSummaries: BudgetSummary[];
  currentMonthBudgetOverview: {
    totalBudget: string;
    totalSpent: string;
    totalRemaining: string;
    isOverspent: boolean;
  };
  budgetHistoryGroups: BudgetHistoryGroup[];
  budgetHistoryRange: BudgetHistoryRange;
  chartDisplayType: ChartDisplayType;
  selectedCategory: string;
  selectedTimeRange: TimeRangeFilter;
  expenseMonthOptions?: string[];
  selectedPlatform: string;
  chartGranularity: ChartGranularity;
  total: string;
  dashboardStats: DashboardStats;
  spendTrend: TrendPoint[];
  trendDetailLookup: Record<string, TrendDetailItem[]>;
  chartSummary: ChartSummary;
  editingBudgetId: string | null;
  deletingBudgetIds: string[];
  isBudgetLoading: boolean;
  isBudgetSubmitting: boolean;
  isBudgetHistoryOpen: boolean;
  budgetStatusMessage: string;
  budgetErrorMessage: string;
  formatCurrency: (amount: string, customCurrency?: string) => string;
  onBudgetFormChange: (updater: (current: BudgetForm) => BudgetForm) => void;
  onBudgetSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onBudgetEditCancel: () => void;
  onBudgetEditStart: (budget: BudgetSummary) => void;
  onBudgetDelete: (budgetId: string) => Promise<void>;
  onBudgetHistoryRangeChange: (range: BudgetHistoryRange) => void;
  onOpenBudgetHistory: () => void;
  onCloseBudgetHistory: () => void;
  onSelectedCategoryChange: (category: string) => void;
  onSelectedTimeRangeChange: (range: TimeRangeFilter) => void;
  onSelectedPlatformChange: (platform: string) => void;
  onChartDisplayTypeChange: (displayType: ChartDisplayType) => void;
  onChartGranularityChange: (granularity: ChartGranularity) => void;
  activeExpenses: Expense[];
  currencySymbol?: string;
};

const statMeta = [
  { key: "total", label: "Current total", description: "Visible spend for the active dashboard filters." },
  { key: "entries", label: "Entries", description: "Number of expenses inside the current view." },
  { key: "average", label: "Average spend", description: "Average amount per entry inside the filtered set." },
  { key: "category", label: "Top category", description: "Largest category inside the active dashboard view." }
] as const;

export function DashboardPage({
  categories,
  wallets,
  dashboardViewMode,
  dashboardWalletId,
  dashboardWallet,
  isDashboardLoading,
  onDashboardViewModeChange,
  onDashboardWalletIdChange,
  dashboardInsights,
  budgetForm,
  budgetCategoryOptions,
  currentBudgetMonthLabel,
  currentMonthBudgetSummaries,
  currentMonthBudgetOverview,
  budgetHistoryGroups,
  budgetHistoryRange,
  chartDisplayType,
  selectedCategory,
  selectedTimeRange,
  expenseMonthOptions = [],
  selectedPlatform,
  chartGranularity,
  total,
  dashboardStats,
  spendTrend,
  trendDetailLookup,
  chartSummary,
  editingBudgetId,
  deletingBudgetIds,
  isBudgetLoading,
  isBudgetSubmitting,
  isBudgetHistoryOpen,
  budgetStatusMessage,
  budgetErrorMessage,
  formatCurrency,
  onBudgetFormChange,
  onBudgetSubmit,
  onBudgetEditCancel,
  onBudgetEditStart,
  onBudgetDelete,
  onBudgetHistoryRangeChange,
  onOpenBudgetHistory,
  onCloseBudgetHistory,
  onSelectedCategoryChange,
  onSelectedTimeRangeChange,
  onSelectedPlatformChange,
  onChartDisplayTypeChange,
  onChartGranularityChange,
  activeExpenses,
  currencySymbol
}: DashboardPageProps) {
  const navigate = useNavigate();
  const [activeTrendDetailKey, setActiveTrendDetailKey] = useState<string | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 640 : false));
  const trendSectionRef = useRef<HTMLElement | null>(null);

  const [visibleTrendCount, setVisibleTrendCount] = useState(12);
  const { currentUser } = useAuth();
  const [userAccounts, setUserAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    let isMounted = true;
    if (currentUser) {
      listBankAccounts(currentUser)
        .then((accs) => {
          if (isMounted) setUserAccounts(accs);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Reset to 12 visible cards whenever filters or dataset change
  useEffect(() => {
    setVisibleTrendCount(12);
  }, [selectedCategory, selectedTimeRange, chartGranularity, selectedPlatform, dashboardViewMode, dashboardWalletId]);

  const visibleSpendTrend = useMemo(() => {
    return spendTrend.slice(0, visibleTrendCount);
  }, [spendTrend, visibleTrendCount]);

  const hasMoreTrend = spendTrend.length > visibleTrendCount;

  const expenseYearOptions = useMemo(() => {
    const years = (expenseMonthOptions ?? []).map((m) => m.slice(0, 4));
    const currentYear = new Date().getFullYear().toString();
    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }
    return [...new Set(years)].sort((a, b) => b.localeCompare(a));
  }, [expenseMonthOptions]);

  const isCustomMonth = /^\d{4}-\d{2}$/.test(selectedTimeRange);
  const isCustomYear = /^\d{4}$/.test(selectedTimeRange);

  let primaryRange = selectedTimeRange;
  if (isCustomMonth) {
    primaryRange = "select_month";
  } else if (isCustomYear) {
    primaryRange = "select_year";
  }

  const targetWallet = useMemo(() => {
    return wallets.find((w) => w.id === dashboardWalletId) ?? null;
  }, [wallets, dashboardWalletId]);

  const trendHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (trendHoverTimeoutRef.current) {
        clearTimeout(trendHoverTimeoutRef.current);
      }
    };
  }, []);

  const isSwitchingSource = Boolean(
    isDashboardLoading ||
    (dashboardViewMode === "wallet" && (
      !dashboardWalletId ||
      !dashboardWallet ||
      dashboardWallet.wallet.id !== dashboardWalletId
    ))
  );
  const showFullLoadingScreen = isSwitchingSource;
  const activeCurrency = dashboardViewMode === "wallet" ? dashboardWallet?.wallet.currency : undefined;
  const isTrendDetailEnabled = chartGranularity === "daily" || chartGranularity === "weekly" || chartGranularity === "monthly";
  const activeTrendPoint = spendTrend.find((point) => point.key === activeTrendDetailKey) ?? null;
  const activeTrendItems = activeTrendPoint ? trendDetailLookup[activeTrendPoint.key] ?? [] : [];

  const [selectedCategoryBreakdown, setSelectedCategoryBreakdown] = useState<string | null>(null);

  const pieChartData = useMemo(() => {
    if (!selectedCategoryBreakdown) return [];

    const catItem = dashboardStats.categoryBreakdown.find((item) => item.category === selectedCategoryBreakdown);
    if (catItem && catItem.platformShares && catItem.platformShares.length > 0) {
      const data = catItem.platformShares.map((share) => {
        const norm = (share.platform || "others").trim().toLowerCase();
        const platform = PLATFORMS.find((p) => p.id === norm || p.name.toLowerCase() === norm);
        return {
          id: norm,
          name: platform ? platform.name : (norm === "others" ? "Others" : share.platform),
          value: share.amount,
          logo: platform?.logo || "/platforms/others.jpg"
        };
      });
      return data.sort((a, b) => b.value - a.value);
    }

    const categoryExpenses = activeExpenses.filter((e) => e.category === selectedCategoryBreakdown);
    const platformSums: Record<string, number> = {};
    let othersSum = 0;

    categoryExpenses.forEach((expense) => {
      const amt = Number(expense.amount) || 0;
      const norm = (expense.platform || "others").trim().toLowerCase();
      if (norm !== "others") {
        platformSums[norm] = (platformSums[norm] || 0) + amt;
      } else {
        othersSum += amt;
      }
    });

    const data = Object.entries(platformSums).map(([platformId, value]) => {
      const platform = PLATFORMS.find((p) => p.id === platformId || p.name.toLowerCase() === platformId);
      return {
        id: platformId,
        name: platform ? platform.name : platformId,
        value,
        logo: platform?.logo || "/platforms/others.jpg"
      };
    });

    if (othersSum > 0) {
      data.push({
        id: "others",
        name: "Others",
        value: othersSum,
        logo: "/platforms/others.jpg"
      });
    }

    if (data.length === 0 && catItem && catItem.amount > 0) {
      data.push({
        id: "others",
        name: "Others",
        value: catItem.amount,
        logo: "/platforms/others.jpg"
      });
    }

    return data.sort((a, b) => b.value - a.value);
  }, [activeExpenses, selectedCategoryBreakdown, dashboardStats.categoryBreakdown]);

  const { bankSpendsData, cardTypeData } = useMemo(() => {
    const bankMap = new Map<string, {
      key: string;
      bankId?: string;
      bankName: string;
      bankAccountId?: string | null;
      accountLabel?: string | null;
      accountType?: BankAccountType | null;
      lastFourDigits?: string | null;
      amount: number;
      count: number;
    }>();

    const typeMap = new Map<string, { type: string; label: string; amount: number; count: number }>();

    let totalSpent = 0;

    for (const exp of activeExpenses) {
      const amt = parseFloat(exp.amount) || 0;
      totalSpent += amt;
      const bAccountId = (exp as any).bank_account_id || (exp as any).bankAccountId || null;
      const rawBankName = exp.bank_name?.trim() || "";

      // Match against the user's saved bank accounts
      const matchedAccount = bAccountId
        ? userAccounts.find((a) => a.id === bAccountId)
        : userAccounts.find((a) => a.bank_name.toLowerCase() === rawBankName.toLowerCase());

      const finalBankName = matchedAccount?.bank_name || rawBankName || "Cash / Other";
      const finalBankId = matchedAccount?.bank_id;
      const finalAccountLabel = matchedAccount?.account_label;
      const finalAccountType = matchedAccount?.account_type;
      const finalLastFour = matchedAccount?.last_four_digits;

      // Group key: distinct per bank account (or per bank name / cash)
      const key = bAccountId || (matchedAccount ? matchedAccount.id : finalBankName);
      const existing = bankMap.get(key) || {
        key,
        bankId: finalBankId,
        bankName: finalBankName,
        bankAccountId: bAccountId || matchedAccount?.id || null,
        accountLabel: finalAccountLabel,
        accountType: finalAccountType,
        lastFourDigits: finalLastFour,
        amount: 0,
        count: 0
      };
      existing.amount += amt;
      existing.count += 1;
      bankMap.set(key, existing);

      // Determine Payment Instrument Type:
      let cardType: string = "cash";
      let cardLabel: string = "Cash / Unassigned";

      if (finalAccountType) {
        cardType = finalAccountType;
        if (cardType === "credit") cardLabel = "Credit Card";
        else if (cardType === "debit") cardLabel = "Debit Card";
        else if (cardType === "rupay_credit") cardLabel = "RuPay Credit";
        else if (cardType === "cash") cardLabel = "Cash";
      } else {
        // Fallback heuristics when unlinked to a registered account
        const bLower = finalBankName.toLowerCase();
        if (bLower.includes("rupay")) {
          cardType = "rupay_credit";
          cardLabel = "RuPay Credit";
        } else if (bLower.includes("credit")) {
          cardType = "credit";
          cardLabel = "Credit Card";
        } else if (bLower.includes("debit") || bLower.includes("savings") || bLower.includes("salary")) {
          cardType = "debit";
          cardLabel = "Debit Card";
        } else if (finalBankName !== "Cash / Other" && finalBankName !== "Cash" && finalBankName !== "") {
          cardType = "debit";
          cardLabel = "Debit Card";
        } else {
          cardType = "cash";
          cardLabel = "Cash / Unassigned";
        }
      }

      const existingType = typeMap.get(cardType) || { type: cardType, label: cardLabel, amount: 0, count: 0 };
      existingType.amount += amt;
      existingType.count += 1;
      typeMap.set(cardType, existingType);
    }

    const banks = Array.from(bankMap.values())
      .map((item) => ({
        ...item,
        share: totalSpent > 0 ? (item.amount / totalSpent) * 100 : 0,
        formattedAmount: formatCurrency(item.amount.toFixed(2), activeCurrency)
      }))
      .sort((a, b) => b.amount - a.amount);

    const cardTypes = Array.from(typeMap.values())
      .map((item) => ({
        ...item,
        share: totalSpent > 0 ? (item.amount / totalSpent) * 100 : 0,
        formattedAmount: formatCurrency(item.amount.toFixed(2), activeCurrency)
      }))
      .sort((a, b) => b.amount - a.amount);

    return { bankSpendsData: banks, cardTypeData: cardTypes };
  }, [activeExpenses, userAccounts, formatCurrency, activeCurrency]);

  const pieChartColors = ["#1e7a53", "#d4a857", "#2e9a6e", "#e2b86c", "#41b585", "#5ca890", "#829085"];

  const platformColorMap: Record<string, string> = {
    swiggy: "#FF5000",           // orange
    zomato: "#CB202D",           // red
    zepto: "#8C2DE9",            // bright purple
    swish: "#5CE681",            // light green
    bigbasket: "#619F05",        // green
    blinkit: "#FFDE00",          // yellow
    amazon_now: "#56B6F7",       // sky blue
    flipkart_minutes: "#FF9F00", // yellowish orange
    uber: "#000000",             // black
    ola: "#A3D829",              // parrot green
    rapido: "#E6B800",           // dark yellow
    district: "#7B2CBF",         // purple
    bookmyshow: "#FF4B60",       // light red
    others: "#829085"            // grey
  };

  const getPlatformColor = (platformId: string, index: number): string => {
    return platformColorMap[platformId] || pieChartColors[index % pieChartColors.length];
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const handleChange = (event: MediaQueryListEvent) => setIsSmallScreen(event.matches);

    setIsSmallScreen(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  function getTrendTooltipAlignment(index: number, totalPoints: number): string {
    if (totalPoints <= 1) {
      return "left-1/2 -translate-x-1/2";
    }

    if (index === 0) {
      return "left-0";
    }

    if (index === totalPoints - 1) {
      return "right-0";
    }

    return "left-1/2 -translate-x-1/2";
  }

  const enableTrendHover = isTrendDetailEnabled && !isSmallScreen;
  const enableTrendTap = isTrendDetailEnabled && isSmallScreen;

  return (
    <div className="space-y-4">
      {/* Sleek Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              {dashboardViewMode === "wallet" ? (
                <>
                  <WalletIcon className="size-3" />
                  <span>{targetWallet?.name || "Shared Wallet"}</span>
                </>
              ) : (
                <>
                  <UserIcon className="size-3" />
                  <span>Personal</span>
                </>
              )}
            </span>
            {isDashboardLoading && !showFullLoadingScreen && (
              <span className="text-[11px] font-medium text-muted flex items-center gap-1 animate-pulse">
                • Updating...
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Overview of spending velocity, category limits, instruments, and budgets.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="ui-button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
            onClick={() => trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <TrendingUp className="size-3.5 text-primary" />
            <span>Spend Trends</span>
          </button>
          <button
            type="button"
            className="ui-button-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm"
            onClick={() => void navigate("/expenses")}
          >
            <Plus className="size-3.5" />
            <span>Add expense</span>
          </button>
        </div>
      </div>

      {/* Compact Filter Toolbar */}
      <SurfaceCard className="p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          {/* Source switch */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-full sm:w-auto">
              <span className="block text-xs font-semibold text-secondary mb-1.5">
                View mode
              </span>
              <div className="source-toggle">
                <button
                  type="button"
                  className="source-toggle-btn flex items-center gap-1.5"
                  aria-pressed={dashboardViewMode === "personal"}
                  onClick={() => onDashboardViewModeChange("personal")}
                >
                  <UserIcon className="size-3.5" />
                  <span>Personal</span>
                </button>
                <button
                  type="button"
                  className="source-toggle-btn flex items-center gap-1.5"
                  aria-pressed={dashboardViewMode === "wallet"}
                  onClick={() => {
                    if (wallets.length === 0) {
                      navigate("/wallets");
                    } else {
                      onDashboardViewModeChange("wallet");
                    }
                  }}
                  title={wallets.length === 0 ? "Click to set up a shared wallet" : "Switch to wallet view"}
                >
                  <WalletIcon className="size-3.5" />
                  <span>Wallet</span>
                </button>
              </div>
            </div>

            {dashboardViewMode === "wallet" && (
              <div className="w-36 sm:w-44">
                {wallets.length > 0 ? (
                  <FilterDropdown
                    label="Wallet"
                    value={dashboardWalletId ?? ""}
                    placeholder="Select wallet"
                    onChange={(val) => onDashboardWalletIdChange(val)}
                    options={wallets.map((w) => ({ value: w.id, label: w.name }))}
                  />
                ) : (
                  <div>
                    <span className="block text-xs font-semibold text-secondary mb-1.5">Wallet</span>
                    <button
                      type="button"
                      onClick={() => navigate("/wallets")}
                      className="inline-flex items-center justify-center gap-1.5 w-full h-[38px] rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      <span>Create wallet</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filters: Category, Platform, Range */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto sm:flex-wrap sm:justify-end">
            <div className="w-full sm:w-36">
              <FilterDropdown
                label="Category"
                value={selectedCategory}
                placeholder="All categories"
                searchable
                onChange={(val) => onSelectedCategoryChange(val)}
                options={[
                  { value: "", label: "All categories" },
                  ...categories.map((cat) => {
                    const match = budgetCategoryOptions.find(
                      (opt) => opt.label.toLowerCase() === cat.toLowerCase()
                    );
                    return {
                      value: cat,
                      label: cat,
                      icon: match ? <CategoryIcon iconId={match.icon} /> : undefined,
                    };
                  }),
                ]}
              />
            </div>

            <div className="w-full sm:w-36">
              <FilterDropdown
                label="Platform"
                value={selectedPlatform}
                placeholder="All platforms"
                onChange={(val) => onSelectedPlatformChange(val)}
                options={[
                  { value: "", label: "All platforms" },
                  { value: "none", label: "No platform" },
                  ...PLATFORMS.filter((p) => p.id !== "others").map((p) => ({
                    value: p.id,
                    label: p.name,
                    icon: <img src={p.logo} alt="" className="h-3.5 w-3.5 rounded-full object-cover shrink-0" />,
                  })),
                  { value: "others", label: "Others" },
                ]}
              />
            </div>

            <div className={cn("w-full sm:w-36", (primaryRange === "select_month" || primaryRange === "select_year") ? "col-span-1" : "col-span-2 sm:col-span-1")}>
              <FilterDropdown
                label="Range"
                value={primaryRange}
                placeholder="All time"
                onChange={(val) => {
                  if (val === "select_month") {
                    const defaultMonth = expenseMonthOptions[0] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                    onSelectedTimeRangeChange(defaultMonth as TimeRangeFilter);
                  } else if (val === "select_year") {
                    const defaultYear = expenseYearOptions[0] || new Date().getFullYear().toString();
                    onSelectedTimeRangeChange(defaultYear as TimeRangeFilter);
                  } else {
                    onSelectedTimeRangeChange(val as TimeRangeFilter);
                  }
                }}
                align="right"
                options={[
                  { value: "all", label: "All time" },
                  { value: "week", label: "This week" },
                  { value: "month", label: "This month" },
                  { value: "year", label: "This year" },
                  { value: "select_month", label: "Select month" },
                  { value: "select_year", label: "Select year" },
                ]}
              />
            </div>

            {primaryRange === "select_month" && (
              <div className="w-full sm:w-38 col-span-1">
                <FilterDropdown
                  label="Month"
                  value={selectedTimeRange}
                  placeholder="Pick a month"
                  onChange={(val) => onSelectedTimeRangeChange(val as TimeRangeFilter)}
                  align="right"
                  searchable={expenseMonthOptions.length > 6}
                  options={expenseMonthOptions.map((m) => ({
                    value: m,
                    label: formatBudgetMonth(m),
                  }))}
                />
              </div>
            )}

            {primaryRange === "select_year" && (
              <div className="w-full sm:w-32 col-span-1">
                <FilterDropdown
                  label="Year"
                  value={selectedTimeRange}
                  placeholder="Pick a year"
                  onChange={(val) => onSelectedTimeRangeChange(val as TimeRangeFilter)}
                  align="right"
                  options={expenseYearOptions.map((y) => ({
                    value: y,
                    label: y,
                  }))}
                />
              </div>
            )}

            {(selectedCategory || selectedPlatform || selectedTimeRange !== "all") && (
              <button
                type="button"
                onClick={() => {
                  onSelectedCategoryChange("");
                  onSelectedPlatformChange("");
                  onSelectedTimeRangeChange("all");
                }}
                className="col-span-2 sm:col-span-1 text-xs text-muted hover:text-ink px-1.5 py-1 transition underline text-center sm:text-left self-center shrink-0"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </SurfaceCard>

      {showFullLoadingScreen ? (
        <div className="space-y-6">
          <SurfaceCard className="relative overflow-hidden border-primary/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[340px] shadow-sm bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(246,249,247,0.85))] dark:bg-zinc-900/90">
            <div className="relative flex items-center justify-center mb-4">
              <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <span className="absolute flex items-center justify-center text-primary">
                {dashboardViewMode === "wallet" ? <WalletIcon className="size-6" /> : <UserIcon className="size-6" />}
              </span>
            </div>
            <h3 className="text-xl font-bold font-display text-ink tracking-tight">
              {dashboardViewMode === "wallet"
                ? `Loading ${targetWallet?.name ? `"${targetWallet.name}"` : "shared wallet"} dashboard...`
                : "Loading personal dashboard..."}
            </h3>
            <p className="mt-1.5 text-sm text-secondary max-w-md">
              {dashboardViewMode === "wallet"
                ? "Downloading shared expenses, group category distributions, budget caps, and spending movement."
                : "Preparing your personal transactions, category analytics, budget tracking, and trend charts."}
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-3.5 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {dashboardViewMode === "wallet" ? "Syncing wallet analytics" : "Syncing personal analytics"}
            </div>
          </SurfaceCard>

          {/* Stat Cards Skeleton */}
          <div className="grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <SurfaceCard key={i} className={cn("p-4 sm:p-5 space-y-3 animate-pulse border-[color:var(--border)]", i === 1 ? "col-span-2 lg:col-span-1" : "col-span-1")}>
                <div className="h-3.5 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                <div className="h-7 w-28 bg-zinc-200 dark:bg-zinc-700 rounded-md mt-2" />
                <div className="h-3 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-md mt-2" />
              </SurfaceCard>
            ))}
          </div>

          {/* Insights Skeleton */}
          <div className="h-10 w-full bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse border border-[color:var(--border)]" />

          {/* Spending Breakdown & Distribution Skeleton */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <SurfaceCard className="p-5 space-y-4 animate-pulse border-[color:var(--border)]">
              <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
              <div className="h-3 w-56 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
              <div className="space-y-3 pt-2">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="flex justify-between items-center py-1">
                    <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                    <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                  </div>
                ))}
              </div>
            </SurfaceCard>
            <SurfaceCard className="p-5 space-y-4 animate-pulse border-[color:var(--border)] flex flex-col items-center justify-center min-h-[220px]">
              <div className="h-28 w-28 rounded-full border-8 border-zinc-200 dark:border-zinc-700" />
            </SurfaceCard>
          </div>
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity duration-200", isDashboardLoading ? "opacity-60 pointer-events-none" : "opacity-100")}>
          <section className="grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-5">
            <SurfaceCard className="col-span-2 lg:col-span-1 relative overflow-hidden bg-[linear-gradient(135deg,var(--primary),var(--gold))] p-4 sm:p-5 text-white shadow-[0_12px_36px_rgba(30,122,83,0.2)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">{statMeta[0].label}</p>
                <CreditCard className="size-4 opacity-80" />
              </div>
              <div className="mt-2 sm:mt-2.5">
                <strong className="block text-2xl sm:text-3xl font-extrabold tracking-tight">{total}</strong>
                <p className="mt-1 text-xs text-white/80 font-medium truncate">{statMeta[0].description}</p>
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-1 p-3.5 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="section-eyebrow text-[10px] sm:text-[11px] truncate">{statMeta[1].label}</p>
                <Receipt className="size-3.5 sm:size-4 text-primary shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2.5">
                <strong className="block text-xl sm:text-3xl font-bold tracking-tight text-ink">{dashboardStats.expenseCount}</strong>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-secondary font-medium truncate">
                  {dashboardStats.expenseCount === 1 ? "1 expense" : `${dashboardStats.expenseCount} in view`}
                </p>
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-1 p-3.5 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="section-eyebrow text-[10px] sm:text-[11px] truncate">{statMeta[2].label}</p>
                <BarChart3 className="size-3.5 sm:size-4 text-primary shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2.5">
                <strong className="block text-xl sm:text-3xl font-bold tracking-tight text-ink truncate">{dashboardStats.average}</strong>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-secondary font-medium truncate">Per transaction</p>
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-1 p-3.5 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="section-eyebrow text-[10px] sm:text-[11px] truncate">{statMeta[3].label}</p>
                <Tag className="size-3.5 sm:size-4 text-primary shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2.5">
                <strong className="block text-base sm:text-2xl font-bold tracking-tight text-ink truncate">
                  {dashboardStats.topCategory?.category ?? "No data"}
                </strong>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-secondary font-medium truncate">
                  {dashboardStats.topCategory ? dashboardStats.topCategory.formattedAmount : "No expenses"}
                </p>
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-1 p-3.5 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="section-eyebrow text-[10px] sm:text-[11px] truncate">Top Platform</p>
                <Store className="size-3.5 sm:size-4 text-primary shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2.5">
                {dashboardStats.topPlatform ? (
                  <div className="flex items-center gap-2">
                    <PlatformLogo
                      logo={PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.logo}
                      name={PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.name ?? dashboardStats.topPlatform?.platform}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg ring-1 ring-primary/20 shrink-0"
                    />
                    <div className="min-w-0">
                      <strong className="block text-xs sm:text-base font-bold tracking-tight text-ink truncate">
                        {PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.name ?? dashboardStats.topPlatform?.platform}
                      </strong>
                      <p className="text-[10px] sm:text-xs text-secondary font-medium truncate">
                        {dashboardStats.topPlatform.formattedAmount}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong className="block text-base sm:text-2xl font-bold tracking-tight text-ink">None</strong>
                    <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-secondary font-medium truncate">No platform used</p>
                  </div>
                )}
              </div>
            </SurfaceCard>
          </section>

          {dashboardInsights.length > 0 && (
            <div className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-white/70 dark:bg-zinc-800/60 border border-[color:var(--border)] shadow-2xs backdrop-blur-sm space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2.5 sm:flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary shrink-0 pl-0.5">
                <Lightbulb className="size-3.5" />
                <span className="uppercase tracking-wider text-[11px]">Key Insights</span>
              </div>
              <div className="h-3.5 w-px bg-[color:var(--border)] hidden sm:block shrink-0" />
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 flex-1 min-w-0">
                {dashboardInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className={cn(
                      "flex items-start sm:items-center gap-2 px-3 py-2 sm:py-1 rounded-xl text-xs transition border font-normal",
                      insight.tone === "positive"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                        : insight.tone === "warning"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
                          : "bg-zinc-100/90 dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-750 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span
                      className="size-1.5 rounded-full mt-1 sm:mt-0 shrink-0"
                      style={{
                        backgroundColor:
                          insight.tone === "positive"
                            ? "#10b981"
                            : insight.tone === "warning"
                              ? "#f59e0b"
                              : "#94a3b8"
                      }}
                    />
                    <div className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-1.5 leading-relaxed">
                      <strong className="font-semibold text-ink block sm:inline">{insight.title}:</strong>{" "}
                      <span className="text-secondary block sm:inline">{insight.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

      <BudgetTrackerSection
        sectionTitle="Budget tracking"
        sectionDescription={`Monitor how much room is left in ${currentBudgetMonthLabel} across your overall and category caps.`}
        currentBudgetMonthLabel={currentBudgetMonthLabel}
        currentMonthBudgetSummaries={currentMonthBudgetSummaries}
        currentMonthBudgetOverview={currentMonthBudgetOverview}
        budgetForm={budgetForm}
        budgetCategoryOptions={budgetCategoryOptions}
        editingBudgetId={editingBudgetId}
        deletingBudgetIds={deletingBudgetIds}
        isBudgetLoading={isBudgetLoading}
        isBudgetSubmitting={isBudgetSubmitting}
        budgetStatusMessage={budgetStatusMessage}
        budgetErrorMessage={budgetErrorMessage}
        budgetHistoryGroups={budgetHistoryGroups}
        budgetHistoryRange={budgetHistoryRange}
        isBudgetHistoryOpen={isBudgetHistoryOpen}
        currencySymbol={currencySymbol}
        emptyStateMessage={`No budgets set for ${currentBudgetMonthLabel} yet. Add one to start tracking remaining spend.`}
        formDescription="Create monthly caps or category-specific targets and update them whenever your plan changes."
        historyDialogTitle="Month-wise budget history"
        historyDialogDescription="Scroll through previous months, filter the range, and jump back into edit mode from here."
        historyEmptyMessage="No budgets fall inside the selected range."
        historyTriggerLabel="View month-wise budgets"
        onBudgetFormChange={onBudgetFormChange}
        onBudgetSubmit={onBudgetSubmit}
        onBudgetEditCancel={onBudgetEditCancel}
        onBudgetEditStart={onBudgetEditStart}
        onBudgetDelete={onBudgetDelete}
        onBudgetHistoryRangeChange={onBudgetHistoryRangeChange}
        onOpenBudgetHistory={onOpenBudgetHistory}
        onCloseBudgetHistory={onCloseBudgetHistory}
        bankSpends={bankSpendsData}
        userAccounts={userAccounts}
      />

      <section className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SurfaceCard className="min-w-0 overflow-hidden space-y-4 p-4 sm:p-5">
          <SectionHeader title="Spending breakdown" description="Categories with the largest share of the current view." />
          {dashboardStats.categoryBreakdown.length === 0 ? (
            <EmptyState title="No breakdown yet" description="Add a few expenses to unlock category weighting and spend share signals." />
          ) : (
            <div className="space-y-3.5">
              {dashboardStats.categoryBreakdown.slice(0, 5).map((item) => (
                <div
                  key={item.category}
                  className="space-y-1.5 py-0.5 cursor-pointer hover:bg-black/[0.02] rounded-lg px-2 -mx-2 transition active:scale-[0.99] select-none"
                  onClick={() => setSelectedCategoryBreakdown(item.category)}
                  title={`View platform breakdown for ${item.category}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <span className="text-sm font-semibold text-ink truncate">{item.category}</span>
                      {item.platforms && item.platforms.length > 0 ? (
                        <div className="flex -space-x-1.5 ml-2 shrink-0">
                          {item.platforms.map((platformId) => {
                            const norm = (platformId || "others").trim().toLowerCase();
                            const platform = PLATFORMS.find((p) => p.id === norm || p.name.toLowerCase() === norm);
                            return (
                              <PlatformLogo
                                key={platformId}
                                logo={platform?.logo || "/platforms/others.jpg"}
                                name={platform?.name || (norm === "others" ? "Others" : platformId)}
                                className="w-5 h-5 rounded-full border border-white/95 ring-1 ring-black/5 shadow-xs"
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex -space-x-1.5 ml-2 shrink-0">
                          <PlatformLogo
                            logo="/platforms/others.jpg"
                            name="Others"
                            className="w-5 h-5 rounded-full border border-white/95 ring-1 ring-black/5 shadow-xs"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-ink">{item.formattedAmount}</span>
                      <span className="text-[10px] font-medium text-muted">({item.share.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.04]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--gold))]" style={{ width: `${Math.max(item.share, 4)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Balanced Recent Activity Card */}
        <SurfaceCard className="flex h-full min-w-0 max-w-full flex-col overflow-hidden space-y-3.5 p-4 sm:p-5">
          <SectionHeader
            title="Recent activity"
            description="Latest transactions recorded in your current view."
            actions={
              <button
                type="button"
                onClick={() => navigate("/expenses")}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0"
              >
                View all &rarr;
              </button>
            }
          />
          {activeExpenses && activeExpenses.length > 0 ? (
            <div className="space-y-2.5 my-auto">
              {activeExpenses.slice(0, 5).map((expense) => {
                const norm = (expense.platform || "others").trim().toLowerCase();
                const platform = PLATFORMS.find((p) => p.id === norm || p.name.toLowerCase() === norm);
                return (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-xl border border-[color:var(--border)] bg-white/70 dark:bg-zinc-800/40 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <PlatformLogo
                        logo={platform?.logo || "/platforms/others.jpg"}
                        name={platform?.name || (norm === "others" ? "Others" : expense.platform || "Others")}
                        className="w-8 h-8 rounded-xl ring-1 ring-black/5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-xs sm:text-sm font-semibold text-ink" title={expense.description}>
                          {expense.description}
                        </strong>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted truncate mt-0.5">
                          <span>{expense.category}</span>
                          <span>•</span>
                          <span>{expense.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-xs sm:text-sm font-bold text-ink">
                        {formatCurrency(expense.amount, activeCurrency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No recent activity yet" description="Your next expense will appear here with its amount, category, and date." />
          )}
        </SurfaceCard>
      </section>

      {/* Bank & Payment Method Spends Section */}
      <section className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SurfaceCard className="min-w-0 overflow-hidden space-y-4 p-4 sm:p-5">
          <SectionHeader
            title="Bank & card spends"
            description="Spending aggregated by bank account and card across your active view."
          />
          {bankSpendsData.length === 0 ? (
            <EmptyState
              title="No bank spends yet"
              description="Assign bank accounts or cards to expenses to unlock bank-level spend breakdown."
            />
          ) : (
            <div className="space-y-3.5">
              {bankSpendsData.map((item) => (
                <div
                  key={item.key}
                  className="space-y-1.5 py-1.5 px-2 -mx-2 rounded-xl transition hover:bg-black/[0.02]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BankLogo bankId={item.bankId} bankName={item.bankName} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-ink truncate block">
                          {item.accountLabel || item.bankName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted flex-wrap">
                          {item.accountType && (
                            <BankCardBadge type={item.accountType} className="scale-90 origin-left py-0" />
                          )}
                          {item.accountLabel && item.accountLabel !== item.bankName && (
                            <span className="truncate">{item.bankName}</span>
                          )}
                          {item.lastFourDigits && (
                            <span>•••• {item.lastFourDigits}</span>
                          )}
                          <span>({item.count} {item.count === 1 ? "expense" : "expenses"})</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-ink">{item.formattedAmount}</span>
                      <span className="text-[10px] font-medium text-muted">({item.share.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.04]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,var(--primary))]"
                      style={{ width: `${Math.max(item.share, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Card Type Distribution */}
        <SurfaceCard className="flex h-full min-w-0 max-w-full flex-col overflow-hidden space-y-4 p-4 sm:p-5 sm:p-6">
          <SectionHeader
            title="Payment type ratio"
            description="Debit cards vs Credit cards vs RuPay vs Cash."
          />
          {cardTypeData.length === 0 ? (
            <EmptyState
              title="No card data yet"
              description="Add expenses with bank cards to view your payment instruments split."
            />
          ) : (
            <div className="space-y-4 my-auto">
              {/* Pie / Donut Chart */}
              <div className="h-44 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cardTypeData}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={68}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {cardTypeData.map((item) => {
                        const color =
                          item.type === "debit"
                            ? "#3b82f6"
                            : item.type === "credit"
                            ? "#a855f7"
                            : item.type === "rupay_credit"
                            ? "#f97316"
                            : item.type === "cash"
                            ? "#10b981"
                            : "#64748b";
                        return <Cell key={item.type} fill={color} />;
                      })}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any, name: any) => [
                        formatCurrency(Number(val).toFixed(2), activeCurrency),
                        name
                      ]}
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.9)",
                        borderColor: "rgba(255, 255, 255, 0.1)",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "#fff",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
                      }}
                      itemStyle={{ color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Payment Type Breakdown Cards */}
              <div className="grid gap-2 sm:grid-cols-2">
                {cardTypeData.map((item) => (
                  <div key={item.type} className="rounded-xl border border-[color:var(--border)] bg-white/70 dark:bg-zinc-800/50 p-2.5 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <BankCardBadge type={item.type === "rupay_credit" ? "rupay_credit" : item.type === "credit" ? "credit" : item.type === "debit" ? "debit" : "other"} />
                        <span className="text-xs font-semibold text-ink truncate">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-ink shrink-0">{item.formattedAmount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{item.count} {item.count === 1 ? "transaction" : "transactions"}</span>
                      <span className="font-semibold text-primary">{item.share.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SurfaceCard>
      </section>

      <section ref={trendSectionRef}>
        <SurfaceCard className="relative z-20 space-y-6 p-5 sm:p-6 lg:p-7">
          <SectionHeader
            title="Spend trend"
            description="Track how your spending moves across the active category and time filters."
            actions={
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[340px]">
                <FilterDropdown
                  label="Graph by"
                  value={chartGranularity}
                  onChange={(val) => onChartGranularityChange(val as ChartGranularity)}
                  options={[
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "quarterly", label: "Quarterly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />

                <FilterDropdown
                  label="Chart type"
                  value={chartDisplayType}
                  onChange={(val) => onChartDisplayTypeChange(val as ChartDisplayType)}
                  align="right"
                  options={[
                    { value: "area", label: "Area" },
                    { value: "bar", label: "Bar" },
                  ]}
                />
              </div>
            }
          />

          {spendTrend.length === 0 ? (
            <EmptyState title="No spend trend yet" description="Add expenses inside the selected filters to render the spending graph." />
          ) : (
            <>
              <div className="rounded-[28px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,243,232,0.74))] p-5 sm:p-6">
                <TrendChart
                  points={chartSummary.points}
                  displayType={chartDisplayType}
                  formatCurrency={(amount) => formatCurrency(amount, activeCurrency)}
                />
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {visibleSpendTrend.map((point, index) => (
                  <div
                    key={point.key}
                    className="relative"
                    onMouseEnter={
                      enableTrendHover
                        ? () => {
                            if (trendHoverTimeoutRef.current) {
                              clearTimeout(trendHoverTimeoutRef.current);
                              trendHoverTimeoutRef.current = null;
                            }
                            setActiveTrendDetailKey(point.key);
                          }
                        : undefined
                    }
                    onMouseLeave={
                      enableTrendHover
                        ? () => {
                            trendHoverTimeoutRef.current = setTimeout(() => {
                              setActiveTrendDetailKey((current) => (current === point.key ? null : current));
                            }, 150);
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className={cn(
                        "w-full cursor-pointer rounded-2xl border border-[color:var(--border)] bg-white/80 p-3 sm:p-3.5 text-left shadow-2xs transition duration-200 hover:border-primary/30",
                        activeTrendDetailKey === point.key && "border-primary/30 ring-2 ring-primary/10"
                      )}
                      onFocus={enableTrendHover ? () => setActiveTrendDetailKey(point.key) : undefined}
                      onBlur={
                        enableTrendHover
                          ? (event) => {
                              if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                                setActiveTrendDetailKey((current) => (current === point.key ? null : current));
                              }
                            }
                          : undefined
                      }
                      onClick={enableTrendTap ? () => setActiveTrendDetailKey((current) => (current === point.key ? null : point.key)) : undefined}
                    >
                      <strong className="block text-base sm:text-lg font-bold text-ink">{formatCurrency(point.total.toFixed(2), activeCurrency)}</strong>
                      <span className="mt-1 block text-xs font-medium text-secondary truncate">{point.label}</span>
                      <small className="mt-0.5 block text-[10px] text-muted">{point.count === 1 ? "1 expense" : `${point.count} expenses`}</small>
                    </button>

                    {enableTrendHover && activeTrendDetailKey === point.key && trendDetailLookup[point.key]?.length ? (
                      <div
                        className={cn(
                          "pointer-events-auto absolute bottom-[calc(100%+8px)] z-20 hidden w-[min(20rem,calc(100vw-2rem))] max-h-[220px] flex-col rounded-[20px] border border-[color:var(--border)] bg-[#faf8f1]/98 p-3 shadow-[0_18px_40px_rgba(40,44,35,0.14)] backdrop-blur-md sm:flex",
                          getTrendTooltipAlignment(index, visibleSpendTrend.length)
                        )}
                        onMouseEnter={() => {
                          if (trendHoverTimeoutRef.current) {
                            clearTimeout(trendHoverTimeoutRef.current);
                            trendHoverTimeoutRef.current = null;
                          }
                        }}
                      >
                        {/* Invisible bridge to catch cursor movement between card and popup */}
                        <div className="absolute -bottom-2.5 left-0 right-0 h-3" aria-hidden="true" />
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border)]/70 pb-2">
                          <strong className="text-sm font-semibold text-ink">{point.label}</strong>
                          <span className="text-xs uppercase tracking-[0.16em] text-muted">{point.count} items</span>
                        </div>
                        <div className="space-y-1.5 overflow-y-auto pr-1">
                          {trendDetailLookup[point.key].map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/90 px-3 py-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                              <span className="truncate text-secondary">{item.description}</span>
                              <span className="shrink-0 font-semibold text-ink">{formatCurrency(item.amount, activeCurrency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {(hasMoreTrend || visibleTrendCount > 12) && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  {hasMoreTrend && (
                    <button
                      type="button"
                      onClick={() => setVisibleTrendCount((prev) => prev + 12)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink shadow-xs transition hover:bg-slate-50 hover:border-primary/40 active:scale-95"
                    >
                      <span>Load more</span>
                      <span className="text-[11px] font-normal text-muted lowercase">
                        ({visibleSpendTrend.length} of {spendTrend.length})
                      </span>
                    </button>
                  )}
                  {visibleTrendCount > 12 && (
                    <button
                      type="button"
                      onClick={() => {
                        setVisibleTrendCount(12);
                        trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/90 bg-white/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-xs transition hover:bg-slate-100 hover:text-ink active:scale-95"
                    >
                      <span>Show less</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        
        </SurfaceCard>
      </section>
    </div>
  )}

      {/* Mobile-only Trend Detail Modal (rendered at root level to prevent space-y shift) */}
      {isSmallScreen && isTrendDetailEnabled && activeTrendPoint && activeTrendItems.length ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(28,33,27,0.45)] p-4 sm:hidden"
          onClick={() => setActiveTrendDetailKey(null)}
          role="presentation"
        >
          <div
            className="max-h-[min(75vh,32rem)] w-full max-w-sm overflow-y-auto rounded-[24px] border border-[color:var(--border)] bg-[#faf8f1] p-4 shadow-[0_24px_70px_rgba(40,44,35,0.24)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${activeTrendPoint.label} trend details`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <strong className="block text-base text-ink">{activeTrendPoint.label}</strong>
                <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-muted">
                  {activeTrendPoint.count} items
                </span>
              </div>
              <button type="button" className="ui-button-ghost px-3 py-2 text-xs" onClick={() => setActiveTrendDetailKey(null)}>
                Close
              </button>
            </div>
            <div className="space-y-2">
              {activeTrendItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-2 text-sm">
                  <span className="truncate text-secondary">{item.description}</span>
                  <span className="font-semibold text-ink">{formatCurrency(item.amount, activeCurrency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {selectedCategoryBreakdown && (
        <ModalFrame onClose={() => setSelectedCategoryBreakdown(null)} className="max-w-[500px] w-full p-5 sm:p-6 rounded-[28px] border border-white/60 bg-white/95 shadow-xl backdrop-blur-xl">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-eyebrow">Category Share Split</p>
                <h3 className="font-display text-3xl leading-none tracking-[-0.03em] text-ink mt-1.5">{selectedCategoryBreakdown}</h3>
              </div>
              <button
                type="button"
                className="ui-button-ghost min-h-0 h-9 w-9 p-0 flex items-center justify-center rounded-full text-secondary hover:text-ink transition"
                onClick={() => setSelectedCategoryBreakdown(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {pieChartData.length === 0 ? (
              <EmptyState title="No platform spend" description="No platform records found under this category." />
            ) : (
              <div className="flex flex-col items-center justify-center sm:flex-row gap-6 py-2">
                <div className="w-[180px] h-[180px] relative flex items-center justify-center shrink-0">
                  <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total</span>
                    <span className="text-base font-bold text-ink">{formatCurrency(pieChartData.reduce((sum, item) => sum + item.value, 0).toFixed(2), activeCurrency)}</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieChartData.map((item, index) => (
                          <Cell key={`cell-${index}`} fill={getPlatformColor(item.id, index)} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any) => [formatCurrency(Number(value).toFixed(2), activeCurrency), "Amount"]}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.95)",
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          fontSize: "12px",
                          color: "var(--ink)",
                          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex-1 space-y-2.5 w-full">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Platform Breakdown</p>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {pieChartData.map((item, index) => {
                      const totalVal = pieChartData.reduce((sum, i) => sum + i.value, 0);
                      const percentage = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getPlatformColor(item.id, index) }} />
                            {item.logo ? (
                              <PlatformLogo logo={item.logo} name={item.name} className="w-4 h-4 rounded-full shadow-xs shrink-0" />
                            ) : null}
                            <span className="font-medium text-ink truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-ink">{formatCurrency(item.value.toFixed(2), activeCurrency)}</span>
                            <span className="text-[10px] text-muted">({percentage.toFixed(0)}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ModalFrame>
      )}
    </div>
  );
}