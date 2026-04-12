import { useState } from "react";
import type { BudgetForm, BudgetHistoryGroup, BudgetHistoryRange, BudgetSummary, CategoryOption, ChartDisplayType, ChartGranularity, ChartSummary, DashboardInsight, DashboardStats, TimeRangeFilter, TrendDetailItem, TrendPoint } from "../types";

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
  const [activeTrendDetailKey, setActiveTrendDetailKey] = useState<string | null>(null);
  const [activeChartPointKey, setActiveChartPointKey] = useState<string | null>(null);
  const isTrendDetailEnabled = chartGranularity === "daily" || chartGranularity === "monthly";
  const chartBarWidth = chartSummary.points.length > 0 ? 100 / chartSummary.points.length : 0;
  const activeChartPoint = chartSummary.points.find((point) => point.key === activeChartPointKey) ?? null;

  function getBudgetTitle(budget: BudgetSummary): string {
    return budget.scope === "monthly" ? "Monthly budget" : budget.category ?? "Category budget";
  }

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
      return " is-left";
    }

    if (x > 80) {
      return " is-right";
    }

    return "";
  }

  return (
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
            <select value={selectedCategory} onChange={(event) => onSelectedCategoryChange(event.target.value)}>
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
            <select value={selectedTimeRange} onChange={(event) => onSelectedTimeRangeChange(event.target.value as TimeRangeFilter)}>
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

      <section className="dashboard-insights-strip" aria-label="Contextual dashboard insights">
        {dashboardInsights.map((insight) => (
          <article key={insight.id} className={`card insight-signal-card is-${insight.tone}`}>
            <span className="metric-label">Insight</span>
            <strong>{insight.title}</strong>
            <p>{insight.body}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-budget-grid">
        <article className="card insight-card budget-overview-card">
          <div className="section-heading budget-overview-heading">
            <div>
              <h2>Budget tracking</h2>
              <p>Monitor how much room is left in {currentBudgetMonthLabel} across your overall and category caps.</p>
            </div>
            <button type="button" className="ghost-button budget-history-trigger" onClick={onOpenBudgetHistory}>
              View month-wise budgets
            </button>
          </div>

          <div className="budget-overview-totals">
            <div className="budget-total-pill">
              <span>Budgeted</span>
              <strong>{currentMonthBudgetOverview.totalBudget}</strong>
            </div>
            <div className="budget-total-pill">
              <span>Spent</span>
              <strong>{currentMonthBudgetOverview.totalSpent}</strong>
            </div>
            <div className={currentMonthBudgetOverview.isOverspent ? "budget-total-pill is-overspent" : "budget-total-pill is-positive"}>
              <span>Remaining</span>
              <strong>{currentMonthBudgetOverview.totalRemaining}</strong>
            </div>
          </div>

          {isBudgetLoading ? <p className="empty-state">Loading budgets...</p> : null}
          {!isBudgetLoading && currentMonthBudgetSummaries.length === 0 ? <p className="empty-state">No budgets set for {currentBudgetMonthLabel} yet. Add one to start tracking remaining spend.</p> : null}

          {!isBudgetLoading && currentMonthBudgetSummaries.length > 0 ? (
            <div className="budget-summary-list">
              {currentMonthBudgetSummaries.map((budget) => (
                <article key={budget.id} className="budget-summary-item">
                  <div className="budget-summary-main">
                    <div>
                      <strong>{getBudgetTitle(budget)}</strong>
                      <p>{budget.scope === "monthly" ? "Applies to all categories this month." : `Tracks ${budget.category} spend for ${currentBudgetMonthLabel}.`}</p>
                    </div>
                    <span className={budget.isOverspent ? "budget-status-badge is-overspent" : "budget-status-badge is-on-track"}>
                      {budget.isOverspent ? "Over budget" : "On track"}
                    </span>
                  </div>

                  <div className="budget-summary-metrics">
                    <div>
                      <span>Budget</span>
                      <strong>{budget.formattedAmount}</strong>
                    </div>
                    <div>
                      <span>Spent</span>
                      <strong>{budget.formattedSpent}</strong>
                    </div>
                    <div>
                      <span>Remaining</span>
                      <strong>{budget.formattedRemaining}</strong>
                    </div>
                  </div>

                  <div className="table-actions">
                    <button type="button" className="table-action-button" onClick={() => onBudgetEditStart(budget)}>
                      Edit
                    </button>
                    <button type="button" className="table-action-button danger-button" disabled={deletingBudgetIds.includes(budget.id)} onClick={() => void onBudgetDelete(budget.id)}>
                      {deletingBudgetIds.includes(budget.id) ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </article>

        <article className="card form-card budget-form-card">
          <div className="section-heading">
            <h2>{editingBudgetId ? "Edit budget" : "Set a budget"}</h2>
            <p>Create monthly caps or category-specific targets and update them whenever your plan changes.</p>
          </div>

          <form className="budget-form-grid" onSubmit={(event) => void onBudgetSubmit(event)}>
            <label>
              <span>Budget type</span>
              <select value={budgetForm.scope} onChange={(event) => onBudgetFormChange((current) => ({ ...current, scope: event.target.value as BudgetForm["scope"] }))}>
                <option value="monthly">Monthly budget</option>
                <option value="category">Category budget</option>
              </select>
            </label>

            <label>
              <span>Amount</span>
              <input type="number" min="0.01" step="0.01" required value={budgetForm.amount} onChange={(event) => onBudgetFormChange((current) => ({ ...current, amount: event.target.value }))} />
            </label>

            <label>
              <span>Month</span>
              <input type="month" required value={budgetForm.month} onChange={(event) => onBudgetFormChange((current) => ({ ...current, month: event.target.value }))} />
            </label>

            {budgetForm.scope === "category" ? (
              <label>
                <span>Category</span>
                <select value={budgetForm.category} onChange={(event) => onBudgetFormChange((current) => ({ ...current, category: event.target.value }))} required>
                  <option value="">Select category</option>
                  {budgetCategoryOptions.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="form-actions budget-form-actions">
              <button type="submit" className="primary-action-button" disabled={isBudgetSubmitting}>
                {isBudgetSubmitting ? (editingBudgetId ? "Updating..." : "Saving...") : editingBudgetId ? "Update budget" : "Save budget"}
              </button>

              {editingBudgetId ? (
                <button type="button" className="ghost-button subtle-button" onClick={onBudgetEditCancel}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          {budgetStatusMessage ? <p className="status-message success">{budgetStatusMessage}</p> : null}
          {budgetErrorMessage ? <p className="status-message error">{budgetErrorMessage}</p> : null}
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

            <div className="trend-controls">
              <label className="trend-filter">
                <span>Graph by</span>
                <select value={chartGranularity} onChange={(event) => onChartGranularityChange(event.target.value as ChartGranularity)}>
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label className="trend-filter">
                <span>Chart type</span>
                <select value={chartDisplayType} onChange={(event) => onChartDisplayTypeChange(event.target.value as ChartDisplayType)}>
                  <option value="area">Area</option>
                  <option value="bar">Bar</option>
                </select>
              </label>
            </div>
          </div>

          {spendTrend.length === 0 ? (
            <p className="empty-state">Add expenses inside the selected filters to render the spending graph.</p>
          ) : (
            <>
              {spendTrend.length === 1 ? <p className="trend-note">Only one data point is available so far. Add more expenses across different dates to reveal momentum.</p> : null}
              <div className="trend-chart-shell">
                <div className="trend-scale">
                  <span>{formatCurrency(chartSummary.peakValue.toFixed(2))}</span>
                  <span>{formatCurrency((chartSummary.peakValue / 2).toFixed(2))}</span>
                  <span>{formatCurrency("0")}</span>
                </div>

                <div className="trend-chart" onMouseLeave={() => setActiveChartPointKey(null)}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Expense trend graph">
                    <defs>
                      <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(31, 111, 80, 0.22)" />
                        <stop offset="100%" stopColor="rgba(31, 111, 80, 0.01)" />
                      </linearGradient>
                      <linearGradient id="trendBarFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1f6f50" />
                        <stop offset="100%" stopColor="#e0a84e" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="100" x2="100" y2="100" className="trend-axis" />
                    <line x1="0" y1="50" x2="100" y2="50" className="trend-grid-line" />
                    <line x1="0" y1="0" x2="100" y2="0" className="trend-grid-line" />
                    {chartDisplayType === "area" ? (
                      <>
                        <path d={chartSummary.areaPath} fill="url(#trendFill)" className="trend-area" />
                        <path d={chartSummary.linePath} fill="none" className="trend-line" />
                        {chartSummary.points.map((point) => (
                          <g key={point.key}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="3.8"
                              className="trend-point-hitbox"
                              onMouseEnter={() => setActiveChartPointKey(point.key)}
                              onFocus={() => setActiveChartPointKey(point.key)}
                              onBlur={() => setActiveChartPointKey((current) => (current === point.key ? null : current))}
                              onClick={() => setActiveChartPointKey((current) => (current === point.key ? null : point.key))}
                              tabIndex={0}
                            />
                            <circle cx={point.x} cy={point.y} r="1.35" className="trend-point" />
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
                              className="trend-bar"
                              fill="url(#trendBarFill)"
                              onMouseEnter={() => setActiveChartPointKey(point.key)}
                              onFocus={() => setActiveChartPointKey(point.key)}
                              onBlur={() => setActiveChartPointKey((current) => (current === point.key ? null : current))}
                              onClick={() => setActiveChartPointKey((current) => (current === point.key ? null : point.key))}
                              tabIndex={0}
                            />
                            <text x={x + barWidth / 2} y={Math.max(y - 2.5, 6)} className="trend-bar-label" textAnchor="middle">
                              {getChartLabel(point.total)}
                            </text>
                          </g>
                        );
                      })
                    )}
                  </svg>

                  {activeChartPoint ? (
                    <div
                      className={`trend-chart-tooltip${getTooltipAlignment(activeChartPoint.x)}`}
                      role="status"
                      style={{ left: `${activeChartPoint.x}%`, top: `${Math.max(activeChartPoint.y - 8, 8)}%` }}
                    >
                      <strong>{activeChartPoint.label}</strong>
                      <span>{formatCurrency(activeChartPoint.total.toFixed(2))}</span>
                      <small>{activeChartPoint.count === 1 ? "1 expense" : `${activeChartPoint.count} expenses`}</small>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="trend-labels" aria-hidden="true">
                {chartSummary.points.map((point) => (
                  <span key={point.key}>{point.shortLabel}</span>
                ))}
              </div>

              <div className="trend-summary-grid">
                {spendTrend.map((point) => (
                  <div
                    key={point.key}
                    className={isTrendDetailEnabled ? "trend-summary-item is-interactive" : "trend-summary-item"}
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
                    tabIndex={isTrendDetailEnabled ? 0 : undefined}
                  >
                    <strong>{formatCurrency(point.total.toFixed(2))}</strong>
                    <span>{point.label}</span>
                    <small>{point.count === 1 ? "1 expense" : `${point.count} expenses`}</small>

                    {isTrendDetailEnabled && activeTrendDetailKey === point.key && trendDetailLookup[point.key]?.length ? (
                      <div className="trend-detail-modal" role="dialog" aria-label={`${point.label} expense details`}>
                        <div className="trend-detail-header">
                          <strong>{point.label}</strong>
                          <span>{point.count === 1 ? "1 item" : `${point.count} items`}</span>
                        </div>

                        <div className="trend-detail-table-shell">
                          <table className="trend-detail-table">
                            <thead>
                              <tr>
                                <th>Description</th>
                                <th>Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trendDetailLookup[point.key].map((item) => (
                                <tr key={item.id}>
                                  <td>{item.description}</td>
                                  <td>{formatCurrency(item.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </section>

      {isBudgetHistoryOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={onCloseBudgetHistory}>
          <div className="confirm-modal budget-history-modal" role="dialog" aria-modal="true" aria-label="Budget history" onClick={(event) => event.stopPropagation()}>
            <div className="budget-history-header">
              <div>
                <h2>Month-wise budget history</h2>
                <p className="confirm-modal-copy">Scroll through previous months, filter the range, and jump back into edit mode from here.</p>
              </div>

              <div className="budget-history-controls">
                <label>
                  <span>Range</span>
                  <select value={budgetHistoryRange} onChange={(event) => onBudgetHistoryRangeChange(event.target.value as BudgetHistoryRange)}>
                    <option value="quarter">Last 3 months</option>
                    <option value="half-year">Last 6 months</option>
                    <option value="year">Last 12 months</option>
                    <option value="all">All time</option>
                  </select>
                </label>

                <button type="button" className="ghost-button" onClick={onCloseBudgetHistory}>
                  Close
                </button>
              </div>
            </div>

            <div className="budget-history-scroll-shell">
              {budgetHistoryGroups.length === 0 ? <p className="empty-state">No budgets fall inside the selected range.</p> : null}

              {budgetHistoryGroups.map((group) => (
                <section key={group.month} className="budget-history-group">
                  <div className="budget-history-month-heading">
                    <h3>{group.label}</h3>
                    <span>{group.items.length === 1 ? "1 budget" : `${group.items.length} budgets`}</span>
                  </div>

                  <div className="budget-history-list">
                    {group.items.map((budget) => (
                      <article key={budget.id} className="budget-history-item">
                        <div className="budget-history-item-copy">
                          <strong>{getBudgetTitle(budget)}</strong>
                          <p>{budget.scope === "monthly" ? "Monthly cap across all expenses." : `Category cap for ${budget.category}.`}</p>
                        </div>

                        <div className="budget-history-item-metrics">
                          <span>Budget {budget.formattedAmount}</span>
                          <span>Spent {budget.formattedSpent}</span>
                          <span className={budget.isOverspent ? "budget-history-remaining is-overspent" : "budget-history-remaining"}>Remaining {budget.formattedRemaining}</span>
                        </div>

                        <div className="table-actions">
                          <button
                            type="button"
                            className="table-action-button"
                            onClick={() => {
                              onBudgetEditStart(budget);
                              onCloseBudgetHistory();
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="table-action-button danger-button" disabled={deletingBudgetIds.includes(budget.id)} onClick={() => void onBudgetDelete(budget.id)}>
                            {deletingBudgetIds.includes(budget.id) ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
