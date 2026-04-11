import { useState } from "react";
import type { ChartGranularity, ChartSummary, DashboardStats, TimeRangeFilter, TrendDetailItem, TrendPoint } from "../types";

type DashboardPageProps = {
  categories: string[];
  selectedCategory: string;
  selectedTimeRange: TimeRangeFilter;
  chartGranularity: ChartGranularity;
  total: string;
  dashboardStats: DashboardStats;
  spendTrend: TrendPoint[];
  trendDetailLookup: Record<string, TrendDetailItem[]>;
  chartSummary: ChartSummary;
  formatCurrency: (amount: string) => string;
  onSelectedCategoryChange: (category: string) => void;
  onSelectedTimeRangeChange: (range: TimeRangeFilter) => void;
  onChartGranularityChange: (granularity: ChartGranularity) => void;
};

export function DashboardPage({
  categories,
  selectedCategory,
  selectedTimeRange,
  chartGranularity,
  total,
  dashboardStats,
  spendTrend,
  trendDetailLookup,
  chartSummary,
  formatCurrency,
  onSelectedCategoryChange,
  onSelectedTimeRangeChange,
  onChartGranularityChange
}: DashboardPageProps) {
  const [activeTrendDetailKey, setActiveTrendDetailKey] = useState<string | null>(null);
  const isTrendDetailEnabled = chartGranularity === "daily" || chartGranularity === "monthly";

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
              <select value={chartGranularity} onChange={(event) => onChartGranularityChange(event.target.value as ChartGranularity)}>
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
    </>
  );
}
