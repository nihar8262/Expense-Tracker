import { useEffect, useRef, useState, useMemo } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { EmptyState, PageHero, SectionHeader, SurfaceCard, ModalFrame, cn } from "../components/ui";
import { TrendChart } from "../components/TrendChart";
import { FilterDropdown } from "../components/FilterDropdown";
import { CategoryIcon } from "../components/CategoryIcon";
import { useNavigate } from "react-router-dom";
import { PLATFORMS } from "../lib/platforms";
import { PlatformLogo } from "../components/PlatformPicker";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import type {
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
    if (catItem && catItem.platformShares) {
      const data = catItem.platformShares.map((share) => {
        const platform = PLATFORMS.find((p) => p.id === share.platform);
        return {
          id: share.platform,
          name: platform ? platform.name : share.platform,
          value: share.amount,
          logo: platform?.logo || null
        };
      });
      return data.sort((a, b) => b.value - a.value);
    }

    const categoryExpenses = activeExpenses.filter((e) => e.category === selectedCategoryBreakdown);
    const platformSums: Record<string, number> = {};
    let othersSum = 0;

    categoryExpenses.forEach((expense) => {
      const amt = Number(expense.amount) || 0;
      if (expense.platform && expense.platform !== "others") {
        platformSums[expense.platform] = (platformSums[expense.platform] || 0) + amt;
      } else {
        othersSum += amt;
      }
    });

    const data = Object.entries(platformSums).map(([platformId, value]) => {
      const platform = PLATFORMS.find((p) => p.id === platformId);
      return {
        id: platformId,
        name: platform ? platform.name : platformId,
        value,
        logo: platform?.logo || null
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

    return data.sort((a, b) => b.value - a.value);
  }, [activeExpenses, selectedCategoryBreakdown, dashboardStats.categoryBreakdown]);

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
    <>
      <PageHero
        eyebrow="Dashboard"
        title="Your spending picture, without the clutter."
        description="Read totals, category pressure, budget room, and recent movement inside one calm analytics surface that adapts cleanly from mobile to large desktop."
        actions={
          <>
            <button
              type="button"
              className="ui-button-secondary w-full justify-center sm:w-auto"
              onClick={() => trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              View report
            </button>
            {/* Issue #9 – primary CTA is larger & has an icon for extra weight */}
            <button
              type="button"
              className="ui-button-primary w-full justify-center sm:w-auto"
              onClick={() => void navigate("/expenses")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
              Add expense
            </button>
          </>
        }
      />

      <SurfaceCard className="relative z-20 space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader title="Data view" description="Refine the dashboard by source, category, and time range without leaving the overview." />
          {isDashboardLoading && !showFullLoadingScreen && (
            <div className="flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full shrink-0 self-start sm:self-auto animate-in fade-in duration-150">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Updating data...
            </div>
          )}
        </div>

        {/* Scope Row: Source toggle + Active Wallet */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pb-3 border-b border-[color:var(--border)]">
          <div className="grid gap-1.5 text-sm font-medium text-secondary w-full sm:w-auto">
            <span>Source</span>
            <div className="source-toggle">
              <button
                type="button"
                className="source-toggle-btn"
                aria-pressed={dashboardViewMode === "personal"}
                onClick={() => onDashboardViewModeChange("personal")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" /></svg>
                Personal
              </button>
              <button
                type="button"
                className="source-toggle-btn"
                aria-pressed={dashboardViewMode === "wallet"}
                onClick={() => onDashboardViewModeChange("wallet")}
                disabled={wallets.length === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path fillRule="evenodd" d="M1 4.75C1 3.784 1.784 3 2.75 3h14.5c.966 0 1.75.784 1.75 1.75v10.515a1.75 1.75 0 0 1-1.75 1.75h-1.5c-.078 0-.155-.005-.23-.015H2.75A1.75 1.75 0 0 1 1 15.25V4.75Zm16.5 7.385V11.5a1.252 1.252 0 0 1-.355-.14l-.004-.002A1.25 1.25 0 0 1 16.5 10.5V8.25a1.25 1.25 0 0 1 0-2.5V4.75a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h14.5a.25.25 0 0 0 .25-.25v-3.115ZM14 10a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" clipRule="evenodd" /></svg>
                Wallet
              </button>
            </div>
          </div>

          {dashboardViewMode === "wallet" && wallets.length > 0 ? (
            <div className="w-full sm:max-w-xs animate-in fade-in duration-200">
              <FilterDropdown
                label="Active Wallet"
                value={dashboardWalletId ?? ""}
                placeholder="Select wallet"
                onChange={(val) => onDashboardWalletIdChange(val)}
                options={wallets.map((w) => ({
                  value: w.id,
                  label: w.name,
                }))}
              />
            </div>
          ) : null}
        </div>

        {/* Stable 3-Column Filter Row: Category, Platform, Range */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Category */}
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

          {/* Platform */}
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
                icon: <img src={p.logo} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />,
              })),
              { value: "others", label: "Others" },
            ]}
          />

          {/* Time range */}
          <FilterDropdown
            label="Range"
            value={selectedTimeRange}
            placeholder="All time"
            onChange={(val) => onSelectedTimeRangeChange(val as TimeRangeFilter)}
            align="right"
            options={[
              { value: "all", label: "All time" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
              { value: "year", label: "This year" },
            ]}
          />
        </div>
      </SurfaceCard>

      {showFullLoadingScreen ? (
        <div className="space-y-6">
          <SurfaceCard className="relative overflow-hidden border-primary/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[340px] shadow-sm bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(246,249,247,0.85))] dark:bg-zinc-900/90">
            <div className="relative flex items-center justify-center mb-4">
              <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <span className="absolute text-xl">
                {dashboardViewMode === "wallet" ? "👛" : "👤"}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <SurfaceCard key={i} className="p-5 sm:p-6 space-y-3 animate-pulse border-[color:var(--border)]">
                <div className="h-3.5 w-24 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-700 rounded-md mt-2" />
                <div className="h-3 w-36 bg-zinc-100 dark:bg-zinc-800 rounded-md mt-2" />
              </SurfaceCard>
            ))}
          </div>

          {/* Insights Skeleton */}
          <div className="grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <SurfaceCard key={i} className="p-5 sm:p-6 space-y-3 animate-pulse border-[color:var(--border)]">
                <div className="h-3.5 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                <div className="h-5 w-44 bg-zinc-200 dark:bg-zinc-700 rounded-md mt-2" />
                <div className="h-10 w-full bg-zinc-100 dark:bg-zinc-800 rounded-md mt-2" />
              </SurfaceCard>
            ))}
          </div>

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
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SurfaceCard className="bg-[linear-gradient(135deg,var(--primary),var(--gold))] p-6 text-white shadow-[0_24px_70px_rgba(30,122,83,0.24)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">{statMeta[0].label}</p>
          <strong className="mt-4 block text-4xl font-semibold tracking-[-0.04em]">{total}</strong>
          <p className="mt-3 text-sm leading-6 text-white/80">{statMeta[0].description}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6">
          <p className="section-eyebrow">{statMeta[1].label}</p>
          <strong className="mt-4 block text-3xl font-semibold tracking-[-0.03em] text-ink">{dashboardStats.expenseCount}</strong>
          <p className="mt-3 text-sm leading-6 text-secondary">{dashboardStats.expenseCount === 1 ? "1 expense in view" : `${dashboardStats.expenseCount} expenses in view`}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6">
          <p className="section-eyebrow">{statMeta[2].label}</p>
          <strong className="mt-4 block text-3xl font-semibold tracking-[-0.03em] text-ink">{dashboardStats.average}</strong>
          <p className="mt-3 text-sm leading-6 text-secondary">{statMeta[2].description}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6">
          <p className="section-eyebrow">{statMeta[3].label}</p>
          <strong className="mt-4 block text-2xl font-semibold tracking-[-0.03em] text-ink">{dashboardStats.topCategory?.category ?? "No data"}</strong>
          <p className="mt-3 text-sm leading-6 text-secondary">{dashboardStats.topCategory ? dashboardStats.topCategory.formattedAmount : "Add expenses to reveal category leaders."}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <p className="section-eyebrow">Top Platform</p>
            {dashboardStats.topPlatform ? (
              <div className="flex items-center gap-3 mt-4">
                <PlatformLogo
                  logo={PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.logo}
                  name={PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.name ?? dashboardStats.topPlatform?.platform}
                  className="w-10 h-10 ring-2 ring-primary/10"
                />
                <div>
                  <strong className="block text-xl font-semibold tracking-[-0.03em] text-ink">
                    {PLATFORMS.find((p) => p.id === dashboardStats.topPlatform?.platform)?.name ?? dashboardStats.topPlatform?.platform}
                  </strong>
                  <p className="text-sm text-secondary mt-0.5">
                    {dashboardStats.topPlatform.formattedAmount} spent
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">No platforms used yet.</p>
            )}
          </div>
          <p className="mt-3 text-sm leading-6 text-secondary">
            {dashboardStats.topPlatform ? "Highest spending platform in view." : "Add platform expenses to reveal."}
          </p>
        </SurfaceCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {dashboardInsights.map((insight) => (
          <SurfaceCard
            key={insight.id}
            className={cn(
              "p-5 sm:p-6",
              insight.tone === "positive"
                ? "bg-[linear-gradient(180deg,rgba(230,243,236,0.92),rgba(255,255,255,0.8))]"
                : insight.tone === "warning"
                  ? "bg-[linear-gradient(180deg,rgba(248,235,203,0.96),rgba(255,255,255,0.84))]"
                  : "bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.65))]"
            )}
          >
            <p className="section-eyebrow">Insight</p>
            <strong className="mt-4 block text-xl font-semibold tracking-[-0.02em] text-ink">{insight.title}</strong>
            <p className="mt-3 text-sm leading-7 text-secondary">{insight.body}</p>
          </SurfaceCard>
        ))}
      </section>

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
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SurfaceCard className="space-y-4 p-4 sm:p-5">
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
                      {item.platforms && item.platforms.length > 0 && (
                        <div className="flex -space-x-1.5 ml-2 shrink-0">
                          {item.platforms.map((platformId) => {
                            const platform = PLATFORMS.find((p) => p.id === platformId);
                            if (!platform) return null;
                            return (
                              <PlatformLogo
                                key={platformId}
                                logo={platform.logo}
                                name={platform.name}
                                className="w-5 h-5 rounded-full border border-white/95 ring-1 ring-black/5 shadow-xs"
                              />
                            );
                          })}
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

          {/* Issue #9: h-full stretches the card to match Spending breakdown height */}
          <SurfaceCard className="flex h-full flex-col space-y-4 p-5 sm:p-6">
          <SectionHeader title="Latest activity" description="The most recent expense in your current dashboard view." />
          {dashboardStats.latestExpense ? (
            <div className="rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,243,232,0.84))] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {dashboardStats.latestExpense.platform ? (
                    <PlatformLogo
                      logo={PLATFORMS.find((p) => p.id === dashboardStats.latestExpense?.platform)?.logo}
                      name={PLATFORMS.find((p) => p.id === dashboardStats.latestExpense?.platform)?.name ?? dashboardStats.latestExpense?.platform}
                      className="w-9 h-9 ring-2 ring-primary/10 shrink-0"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <strong className="block truncate text-base font-semibold tracking-tight text-ink">{dashboardStats.latestExpense.description}</strong>
                    <p className="text-xs text-muted">{dashboardStats.latestExpense.category}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <strong className="block text-xl font-semibold tracking-tight text-ink">{formatCurrency(dashboardStats.latestExpense.amount, activeCurrency)}</strong>
                  <span className="text-xs text-muted">{dashboardStats.latestExpense.date}</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No recent activity yet" description="Your next expense will appear here with its amount, category, and date." />
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {spendTrend.map((point, index) => (
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
                        "w-full cursor-pointer rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 text-left shadow-sm transition duration-200",
                        activeTrendDetailKey === point.key && "border-primary/25 ring-2 ring-primary/10"
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
                      <strong className="block text-xl text-ink">{formatCurrency(point.total.toFixed(2), activeCurrency)}</strong>
                      <span className="mt-2 block text-sm font-medium text-secondary">{point.label}</span>
                      <small className="mt-1 block text-muted">{point.count === 1 ? "1 expense" : `${point.count} expenses`}</small>
                    </button>

                    {enableTrendHover && activeTrendDetailKey === point.key && trendDetailLookup[point.key]?.length ? (
                      <div
                        className={cn(
                          "pointer-events-auto absolute bottom-[calc(100%+8px)] z-20 hidden w-[min(20rem,calc(100vw-2rem))] max-h-[220px] flex-col rounded-[20px] border border-[color:var(--border)] bg-[#faf8f1]/98 p-3 shadow-[0_18px_40px_rgba(40,44,35,0.14)] backdrop-blur-md sm:flex",
                          getTrendTooltipAlignment(index, spendTrend.length)
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
    </>
  );
}