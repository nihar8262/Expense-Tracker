import { useRef, useState } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { EmptyState, PageHero, SectionHeader, SurfaceCard, cn } from "../components/ui";
import { useNavigate } from "react-router-dom";
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
  TimeRangeFilter,
  TrendDetailItem,
  TrendPoint
} from "../types";

type DashboardPageProps = {
  categories: string[];
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
  formatCurrency: (amount: string) => string;
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
  onChartDisplayTypeChange: (displayType: ChartDisplayType) => void;
  onChartGranularityChange: (granularity: ChartGranularity) => void;
};

const statMeta = [
  { key: "total", label: "Current total", description: "Visible spend for the active dashboard filters." },
  { key: "entries", label: "Entries", description: "Number of expenses inside the current view." },
  { key: "average", label: "Average spend", description: "Average amount per entry inside the filtered set." },
  { key: "category", label: "Top category", description: "Largest category inside the active dashboard view." }
] as const;

export function DashboardPage({
  categories,
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
  onChartDisplayTypeChange,
  onChartGranularityChange
}: DashboardPageProps) {
  const navigate = useNavigate();
  const [activeTrendDetailKey, setActiveTrendDetailKey] = useState<string | null>(null);
  const [activeChartPointKey, setActiveChartPointKey] = useState<string | null>(null);
  const trendSectionRef = useRef<HTMLElement | null>(null);
  const isTrendDetailEnabled = chartGranularity === "daily" || chartGranularity === "weekly" || chartGranularity === "monthly";
  const activeTrendPoint = spendTrend.find((point) => point.key === activeTrendDetailKey) ?? null;
  const activeTrendItems = activeTrendPoint ? trendDetailLookup[activeTrendPoint.key] ?? [] : [];
  const chartBarWidth = chartSummary.points.length > 0 ? 100 / chartSummary.points.length : 0;
  const activeChartPoint = chartSummary.points.find((point) => point.key === activeChartPointKey) ?? null;
  const chartMinWidth = Math.max(
    chartSummary.points.length * (chartGranularity === "daily" ? 42 : chartGranularity === "weekly" ? 52 : chartGranularity === "monthly" ? 56 : 68),
    320
  );
  const chartScaleTicks = [chartSummary.peakValue, chartSummary.peakValue * 0.66, chartSummary.peakValue * 0.33, 0].map((value) =>
    Math.max(0, Number(value.toFixed(2)))
  );

  function getChartLabel(amount: number): string {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1
    }).format(amount);
  }

  function getTooltipAlignment(x: number): string {
    if (x < 20) {
      return "-translate-x-[5%]";
    }

    if (x > 80) {
      return "-translate-x-[95%]";
    }

    return "-translate-x-1/2";
  }

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
            <button type="button" className="ui-button-primary w-full justify-center sm:w-auto" onClick={() => void navigate("/expenses")}>
              Add expense
            </button>
          </>
        }
      />

      <SurfaceCard className="space-y-5 p-5 sm:p-6">
        <SectionHeader title="Data view" description="Refine the dashboard by category and time range without leaving the overview." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            Category
            <select value={selectedCategory} onChange={(event) => onSelectedCategoryChange(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-secondary">
            Range
            <select value={selectedTimeRange} onChange={(event) => onSelectedTimeRangeChange(event.target.value as TimeRangeFilter)}>
              <option value="all">All time</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </label>
        </div>
      </SurfaceCard>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader title="Spending breakdown" description="Categories with the largest share of the current view." />
          {dashboardStats.categoryBreakdown.length === 0 ? (
            <EmptyState title="No breakdown yet" description="Add a few expenses to unlock category weighting and spend share signals." />
          ) : (
            <div className="grid gap-4">
              {dashboardStats.categoryBreakdown.slice(0, 5).map((item) => (
                <div key={item.category} className="space-y-2 rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-base text-ink">{item.category}</strong>
                    <span className="text-sm font-semibold text-ink">{item.formattedAmount}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#edf1eb]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--gold))]" style={{ width: `${Math.max(item.share, 8)}%` }} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{item.share.toFixed(0)}% of current spend</p>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader title="Latest activity" description="The most recent expense in your current dashboard view." />
          {dashboardStats.latestExpense ? (
            <div className="space-y-4 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,243,232,0.84))] p-5">
              <span className="data-pill">{dashboardStats.latestExpense.date}</span>
              <div>
                <strong className="block text-2xl font-semibold tracking-[-0.03em] text-ink">{dashboardStats.latestExpense.description}</strong>
                <p className="mt-2 text-sm leading-6 text-secondary">{dashboardStats.latestExpense.category}</p>
              </div>
              <div className="rounded-[22px] bg-white/85 px-4 py-4 text-right shadow-sm">
                <span className="section-eyebrow">Amount</span>
                <strong className="mt-2 block text-3xl text-ink">{formatCurrency(dashboardStats.latestExpense.amount)}</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="No recent activity yet" description="Your next expense will appear here with its amount, category, and date." />
          )}
        </SurfaceCard>
      </section>

      <section ref={trendSectionRef}>
        <SurfaceCard className="space-y-6 p-5 sm:p-6 lg:p-7">
          <SectionHeader
            title="Spend trend"
            description="Track how your spending moves across the active category and time filters."
            actions={
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[420px]">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Graph by
                  <select value={chartGranularity} onChange={(event) => onChartGranularityChange(event.target.value as ChartGranularity)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Chart type
                  <select value={chartDisplayType} onChange={(event) => onChartDisplayTypeChange(event.target.value as ChartDisplayType)}>
                    <option value="area">Area</option>
                    <option value="bar">Bar</option>
                  </select>
                </label>
              </div>
            }
          />

          {spendTrend.length === 0 ? (
            <EmptyState title="No spend trend yet" description="Add expenses inside the selected filters to render the spending graph." />
          ) : (
            <>
              <div className="rounded-[28px] border border-[color:var(--border)] bg-white/80 p-3 sm:p-5 lg:p-6">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:gap-4">
                  <div className="flex h-[240px] flex-col justify-between pb-7 pr-2 pt-1 text-[10px] font-semibold text-ink sm:h-[360px] sm:text-xs lg:h-[540px] xl:h-[600px]">
                    {chartScaleTicks.map((tick, index) => (
                      <span key={`${tick}-${index}`} className="whitespace-nowrap leading-none">
                        {getChartLabel(tick)}
                      </span>
                    ))}
                  </div>

                  <div className="overflow-x-auto pb-2">
                    <div style={{ minWidth: `${chartMinWidth}px` }}>
                      <div className="relative h-[240px] sm:h-[360px] lg:h-[540px] xl:h-[600px]" onMouseLeave={() => setActiveChartPointKey(null)}>
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label="Expense trend graph">
                          <defs>
                            <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="rgba(30,122,83,0.26)" />
                              <stop offset="100%" stopColor="rgba(30,122,83,0.02)" />
                            </linearGradient>
                            <linearGradient id="trendBarFill" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#1e7a53" />
                              <stop offset="100%" stopColor="#d4a857" />
                            </linearGradient>
                          </defs>
                          <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(29,42,34,0.14)" strokeWidth="0.4" />
                          <line x1="0" y1="66" x2="100" y2="66" stroke="rgba(29,42,34,0.08)" strokeWidth="0.35" />
                          <line x1="0" y1="33" x2="100" y2="33" stroke="rgba(29,42,34,0.08)" strokeWidth="0.35" />
                          <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(29,42,34,0.08)" strokeWidth="0.35" />

                          {chartDisplayType === "area" ? (
                            <>
                              <path d={chartSummary.areaPath} fill="url(#trendFill)" />
                              <path d={chartSummary.linePath} fill="none" stroke="#1e7a53" strokeWidth="1.6" />
                              {chartSummary.points.map((point) => (
                                <g key={point.key}>
                                  <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r="4.2"
                                    fill="transparent"
                                    onMouseEnter={() => setActiveChartPointKey(point.key)}
                                    onFocus={() => setActiveChartPointKey(point.key)}
                                    onBlur={() => setActiveChartPointKey((current) => (current === point.key ? null : current))}
                                    onClick={() => setActiveChartPointKey((current) => (current === point.key ? null : point.key))}
                                    tabIndex={0}
                                  />
                                  <circle cx={point.x} cy={point.y} r="1.6" fill="#1e7a53" />
                                </g>
                              ))}
                            </>
                          ) : (
                            chartSummary.points.map((point, index) => {
                              const barWidth = Math.max(chartBarWidth * 0.62, 4);
                              const x = chartSummary.points.length === 1 ? 50 - barWidth / 2 : index * chartBarWidth + (chartBarWidth - barWidth) / 2;
                              const height = chartSummary.peakValue === 0 ? 0 : (point.total / chartSummary.peakValue) * 100;
                              const y = 100 - height;

                              return (
                                <g key={point.key}>
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={height}
                                    rx="1.4"
                                    fill="url(#trendBarFill)"
                                    onMouseEnter={() => setActiveChartPointKey(point.key)}
                                    onFocus={() => setActiveChartPointKey(point.key)}
                                    onBlur={() => setActiveChartPointKey((current) => (current === point.key ? null : current))}
                                    onClick={() => setActiveChartPointKey((current) => (current === point.key ? null : point.key))}
                                    tabIndex={0}
                                  />
                                  <text x={x + barWidth / 2} y={Math.max(y - 2.5, 6)} fill="#26342d" fontWeight="700" fontSize="2.5" textAnchor="middle">
                                    {getChartLabel(point.total)}
                                  </text>
                                </g>
                              );
                            })
                          )}
                        </svg>

                        {activeChartPoint ? (
                      <div
                        className={cn(
                          "absolute hidden min-w-[150px] rounded-2xl border border-white/70 bg-white/96 px-4 py-3 text-sm text-ink shadow-[0_18px_40px_rgba(40,44,35,0.14)] backdrop-blur-md sm:block",
                          getTooltipAlignment(activeChartPoint.x)
                        )}
                        role="status"
                        style={{ left: `${activeChartPoint.x}%`, top: `${Math.max(activeChartPoint.y - 8, 8)}%` }}
                      >
                        <strong className="block">{activeChartPoint.label}</strong>
                        <span className="mt-1 block font-semibold text-primary">{formatCurrency(activeChartPoint.total.toFixed(2))}</span>
                        <small className="mt-1 block text-muted">{activeChartPoint.count === 1 ? "1 expense" : `${activeChartPoint.count} expenses`}</small>
                      </div>
                    ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(48px,1fr))] gap-1.5 text-[11px] font-medium text-muted sm:mt-5 sm:grid-cols-[repeat(auto-fit,minmax(72px,1fr))] sm:gap-2 sm:text-xs">
                        {chartSummary.points.map((point) => (
                          <span key={point.key} className="truncate text-center">
                            {point.shortLabel}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {activeChartPoint ? (
                <div className="rounded-[22px] border border-[color:var(--border)] bg-[#faf8f1] px-4 py-3 sm:hidden">
                  <strong className="block text-sm text-ink">{activeChartPoint.label}</strong>
                  <span className="mt-1 block text-base font-semibold text-primary">{formatCurrency(activeChartPoint.total.toFixed(2))}</span>
                  <small className="mt-1 block text-muted">{activeChartPoint.count === 1 ? "1 expense" : `${activeChartPoint.count} expenses`}</small>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {spendTrend.map((point, index) => (
                  <button
                    key={point.key}
                    type="button"
                    className={cn(
                      "relative rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 text-left shadow-sm hover:-translate-y-0.5",
                      activeTrendDetailKey === point.key && "border-primary/25 ring-2 ring-primary/10"
                    )}
                    onMouseEnter={isTrendDetailEnabled ? () => setActiveTrendDetailKey(point.key) : undefined}
                    onMouseLeave={isTrendDetailEnabled ? () => setActiveTrendDetailKey((current) => (current === point.key ? null : current)) : undefined}
                    onFocus={isTrendDetailEnabled ? () => setActiveTrendDetailKey(point.key) : undefined}
                    onBlur={
                      isTrendDetailEnabled
                        ? (event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setActiveTrendDetailKey((current) => (current === point.key ? null : current));
                            }
                          }
                        : undefined
                    }
                    onClick={isTrendDetailEnabled ? () => setActiveTrendDetailKey((current) => (current === point.key ? null : point.key)) : undefined}
                  >
                    <strong className="block text-xl text-ink">{formatCurrency(point.total.toFixed(2))}</strong>
                    <span className="mt-2 block text-sm font-medium text-secondary">{point.label}</span>
                    <small className="mt-1 block text-muted">{point.count === 1 ? "1 expense" : `${point.count} expenses`}</small>

                    {isTrendDetailEnabled && activeTrendDetailKey === point.key && trendDetailLookup[point.key]?.length ? (
                      <div
                        className={cn(
                          "pointer-events-none absolute bottom-[calc(100%+14px)] z-20 hidden w-[min(18rem,calc(100vw-2rem))] rounded-[20px] border border-[color:var(--border)] bg-[#faf8f1]/98 p-3 shadow-[0_18px_40px_rgba(40,44,35,0.14)] backdrop-blur-md sm:block",
                          getTrendTooltipAlignment(index, spendTrend.length)
                        )}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <strong className="text-sm text-ink">{point.label}</strong>
                          <span className="text-xs uppercase tracking-[0.16em] text-muted">{point.count} items</span>
                        </div>
                        <div className="space-y-2">
                          {trendDetailLookup[point.key].map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-2 text-sm">
                              <span className="truncate text-secondary">{item.description}</span>
                              <span className="font-semibold text-ink">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>

              {isTrendDetailEnabled && activeTrendPoint && activeTrendItems.length ? (
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
                          <span className="font-semibold text-ink">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        
        </SurfaceCard>
      </section>
    </>
  );
}