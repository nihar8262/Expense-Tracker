import { useMemo, useState } from "react";
import type { BudgetForm, BudgetHistoryGroup, BudgetHistoryRange, BudgetSummary, CategoryOption } from "../types";
import { ModalFrame, SectionHeader, StatusNotice, SurfaceCard, cn } from "./ui";

type BudgetTrackerSectionProps = {
  sectionTitle: string;
  sectionDescription: string;
  currentBudgetMonthLabel: string;
  currentMonthBudgetSummaries: BudgetSummary[];
  currentMonthBudgetOverview: {
    totalBudget: string;
    totalSpent: string;
    totalRemaining: string;
    isOverspent: boolean;
  };
  budgetForm: BudgetForm;
  budgetCategoryOptions: CategoryOption[];
  editingBudgetId: string | null;
  deletingBudgetIds: string[];
  isBudgetLoading: boolean;
  isBudgetSubmitting: boolean;
  budgetStatusMessage: string;
  budgetErrorMessage: string;
  budgetHistoryGroups: BudgetHistoryGroup[];
  budgetHistoryRange: BudgetHistoryRange;
  isBudgetHistoryOpen: boolean;
  emptyStateMessage: string;
  formDescription: string;
  historyDialogTitle: string;
  historyDialogDescription: string;
  historyEmptyMessage: string;
  historyTriggerLabel: string;
  onBudgetFormChange: (updater: (current: BudgetForm) => BudgetForm) => void;
  onBudgetSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onBudgetEditCancel: () => void;
  onBudgetEditStart: (budget: BudgetSummary) => void;
  onBudgetDelete: (budgetId: string) => Promise<void>;
  onBudgetHistoryRangeChange: (range: BudgetHistoryRange) => void;
  onOpenBudgetHistory: () => void;
  onCloseBudgetHistory: () => void;
};

function getBudgetTitle(budget: BudgetSummary): string {
  return budget.scope === "monthly" ? "Monthly budget" : budget.category ?? "Category budget";
}

function getBudgetProgress(budget: BudgetSummary): number {
  const total = Number(budget.amount);

  if (total <= 0) {
    return 0;
  }

  return Math.min((budget.spent / total) * 100, 100);
}

export function BudgetTrackerSection({
  sectionTitle,
  sectionDescription,
  currentBudgetMonthLabel,
  currentMonthBudgetSummaries,
  currentMonthBudgetOverview,
  budgetForm,
  budgetCategoryOptions,
  editingBudgetId,
  deletingBudgetIds,
  isBudgetLoading,
  isBudgetSubmitting,
  budgetStatusMessage,
  budgetErrorMessage,
  budgetHistoryGroups,
  budgetHistoryRange,
  isBudgetHistoryOpen,
  emptyStateMessage,
  formDescription,
  historyDialogTitle,
  historyDialogDescription,
  historyEmptyMessage,
  historyTriggerLabel,
  onBudgetFormChange,
  onBudgetSubmit,
  onBudgetEditCancel,
  onBudgetEditStart,
  onBudgetDelete,
  onBudgetHistoryRangeChange,
  onOpenBudgetHistory,
  onCloseBudgetHistory
}: BudgetTrackerSectionProps) {
  const [showBudgetValidation, setShowBudgetValidation] = useState(false);
  const [isMobileEditOpen, setIsMobileEditOpen] = useState(false);

  const budgetErrors = useMemo(
    () => ({
      amount: budgetForm.amount.trim() ? "" : "Amount is required.",
      month: budgetForm.month.trim() ? "" : "Month is required.",
      category: budgetForm.scope === "category" && !budgetForm.category.trim() ? "Category is required." : ""
    }),
    [budgetForm.amount, budgetForm.month, budgetForm.scope, budgetForm.category]
  );

  async function handleValidatedBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowBudgetValidation(true);

    if (Object.values(budgetErrors).some(Boolean)) {
      return;
    }

    await onBudgetSubmit(event);
    setShowBudgetValidation(false);
    setIsMobileEditOpen(false);
  }

  function handleValidatedBudgetEditCancel() {
    setShowBudgetValidation(false);
    setIsMobileEditOpen(false);
    onBudgetEditCancel();
  }

  function handleEditStart(budget: BudgetSummary) {
    onBudgetEditStart(budget);
    // Open mobile modal on small screens (< xl breakpoint = 1280px)
    if (window.innerWidth < 1280) {
      setIsMobileEditOpen(true);
    }
  }

  function renderBudgetForm() {
    return (
      <form className="grid gap-4" onSubmit={(event) => void handleValidatedBudgetSubmit(event)} noValidate>
        <label className="grid gap-2 text-sm font-medium text-secondary">
          Budget type
          <select value={budgetForm.scope} onChange={(event) => onBudgetFormChange((current) => ({ ...current, scope: event.target.value as BudgetForm["scope"] }))}>
            <option value="monthly">Monthly budget</option>
            <option value="category">Category budget</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          <span className="required-mark">Amount</span>
          <input type="number" min="0.01" step="0.01" required value={budgetForm.amount} onChange={(event) => onBudgetFormChange((current) => ({ ...current, amount: event.target.value }))} aria-invalid={showBudgetValidation && Boolean(budgetErrors.amount)} />
          {showBudgetValidation && budgetErrors.amount ? <span className="text-sm text-[color:var(--danger-text)]">{budgetErrors.amount}</span> : null}
        </label>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          <span className="required-mark">Month</span>
          <input type="month" required value={budgetForm.month} onChange={(event) => onBudgetFormChange((current) => ({ ...current, month: event.target.value }))} aria-invalid={showBudgetValidation && Boolean(budgetErrors.month)} />
          {showBudgetValidation && budgetErrors.month ? <span className="text-sm text-[color:var(--danger-text)]">{budgetErrors.month}</span> : null}
        </label>

        {budgetForm.scope === "category" ? (
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Category</span>
            <select value={budgetForm.category} onChange={(event) => onBudgetFormChange((current) => ({ ...current, category: event.target.value }))} required aria-invalid={showBudgetValidation && Boolean(budgetErrors.category)}>
              <option value="">Select category</option>
              {budgetCategoryOptions.map((option) => (
                <option key={option.id} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
            {showBudgetValidation && budgetErrors.category ? <span className="text-sm text-[color:var(--danger-text)]">{budgetErrors.category}</span> : null}
          </label>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {editingBudgetId ? (
            <button type="button" className="ui-button-secondary" onClick={handleValidatedBudgetEditCancel}>
              Cancel edit
            </button>
          ) : null}
          <button type="submit" className="ui-button-primary" disabled={isBudgetSubmitting}>
            {isBudgetSubmitting ? (editingBudgetId ? "Updating..." : "Saving...") : editingBudgetId ? "Update budget" : "Save budget"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            title={sectionTitle}
            description={sectionDescription}
            actions={
              <button type="button" className="ui-button-secondary" onClick={onOpenBudgetHistory}>
                {historyTriggerLabel}
              </button>
            }
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
              <p className="section-eyebrow">Budgeted</p>
              <strong className="mt-2 block text-xl text-ink">{currentMonthBudgetOverview.totalBudget}</strong>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
              <p className="section-eyebrow">Spent</p>
              <strong className="mt-2 block text-xl text-ink">{currentMonthBudgetOverview.totalSpent}</strong>
            </div>
            <div className={cn("rounded-[22px] border p-4 shadow-sm", currentMonthBudgetOverview.isOverspent ? "border-[color:rgba(154,63,56,0.16)] bg-danger-tint" : "border-primary/10 bg-success-tint")}>
              <p className="section-eyebrow">Remaining</p>
              <strong className="mt-2 block text-xl text-ink">{currentMonthBudgetOverview.totalRemaining}</strong>
            </div>
          </div>

          {isBudgetLoading ? <StatusNotice tone="neutral">Loading budgets...</StatusNotice> : null}
          {!isBudgetLoading && currentMonthBudgetSummaries.length === 0 ? <StatusNotice tone="neutral">{emptyStateMessage}</StatusNotice> : null}

          {!isBudgetLoading && currentMonthBudgetSummaries.length > 0 ? (
            <div className="grid gap-4">
              {currentMonthBudgetSummaries.map((budget) => (
                <article key={budget.id} className="rounded-[24px] border border-[color:var(--border)] bg-white/80 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink">{getBudgetTitle(budget)}</h3>
                        <span className={cn("data-pill", budget.isOverspent ? "tone-danger" : "tone-positive")}>{budget.isOverspent ? "Over budget" : "On track"}</span>
                      </div>
                      <p className="text-sm leading-6 text-secondary">
                        {budget.scope === "monthly" ? `Applies to all categories in ${currentBudgetMonthLabel}.` : `Tracks ${budget.category} spend for ${currentBudgetMonthLabel}.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ui-button-ghost" onClick={() => handleEditStart(budget)}>
                        Edit
                      </button>
                      <button type="button" className="ui-button-danger" disabled={deletingBudgetIds.includes(budget.id)} onClick={() => void onBudgetDelete(budget.id)}>
                        {deletingBudgetIds.includes(budget.id) ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="section-eyebrow">Budget</p>
                      <strong className="mt-1 block text-lg text-ink">{budget.formattedAmount}</strong>
                    </div>
                    <div>
                      <p className="section-eyebrow">Spent</p>
                      <strong className="mt-1 block text-lg text-ink">{budget.formattedSpent}</strong>
                    </div>
                    <div>
                      <p className="section-eyebrow">Remaining</p>
                      <strong className="mt-1 block text-lg text-ink">{budget.formattedRemaining}</strong>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    <div className="h-3 overflow-hidden rounded-full bg-[#edf1eb]">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--gold))]" style={{ width: `${Math.max(getBudgetProgress(budget), 6)}%` }} />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{getBudgetProgress(budget).toFixed(0)}% used</p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader title={editingBudgetId ? "Edit budget" : "Set a budget"} description={formDescription} />

          {renderBudgetForm()}

          {budgetStatusMessage ? <StatusNotice tone="success">{budgetStatusMessage}</StatusNotice> : null}
          {budgetErrorMessage ? <StatusNotice tone="error">{budgetErrorMessage}</StatusNotice> : null}
        </SurfaceCard>
      </section>

      {isBudgetHistoryOpen ? (
        <ModalFrame onClose={onCloseBudgetHistory} className="flex max-h-[88vh] flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <h2 className="font-display text-[2.3rem] leading-none tracking-[-0.04em] text-ink">{historyDialogTitle}</h2>
                <p className="max-w-2xl text-sm leading-7 text-secondary">{historyDialogDescription}</p>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Range
                  <select value={budgetHistoryRange} onChange={(event) => onBudgetHistoryRangeChange(event.target.value as BudgetHistoryRange)}>
                    <option value="quarter">Last 3 months</option>
                    <option value="half-year">Last 6 months</option>
                    <option value="year">Last 12 months</option>
                    <option value="all">All time</option>
                  </select>
                </label>
                <button type="button" className="ui-button-secondary" onClick={onCloseBudgetHistory}>
                  Close
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {budgetHistoryGroups.length === 0 ? <StatusNotice tone="neutral">{historyEmptyMessage}</StatusNotice> : null}

            <div className="grid gap-6">
              {budgetHistoryGroups.map((group) => (
                <section key={group.month} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-ink">{group.label}</h3>
                      <p className="text-sm text-muted">{group.items.length === 1 ? "1 budget" : `${group.items.length} budgets`}</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {group.items.map((budget) => (
                      <article key={budget.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1.5">
                            <h4 className="text-lg font-semibold text-ink">{getBudgetTitle(budget)}</h4>
                            <p className="text-sm leading-6 text-secondary">
                              {budget.scope === "monthly" ? "Monthly cap across all expenses." : `Category cap for ${budget.category}.`}
                            </p>
                            <div className="flex flex-wrap gap-3 text-sm text-secondary">
                              <span>Budget {budget.formattedAmount}</span>
                              <span>Spent {budget.formattedSpent}</span>
                              <span className={budget.isOverspent ? "text-[color:var(--danger-text)]" : "text-primary"}>Remaining {budget.formattedRemaining}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="ui-button-ghost"
                              onClick={() => {
                                handleEditStart(budget);
                                onCloseBudgetHistory();
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" className="ui-button-danger" disabled={deletingBudgetIds.includes(budget.id)} onClick={() => void onBudgetDelete(budget.id)}>
                              {deletingBudgetIds.includes(budget.id) ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {isMobileEditOpen ? (
        <ModalFrame onClose={handleValidatedBudgetEditCancel} className="flex max-h-[92vh] flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink">
                {editingBudgetId ? "Edit budget" : "Set a budget"}
              </h2>
              <button type="button" className="ui-button-secondary shrink-0" onClick={handleValidatedBudgetEditCancel}>
                Cancel
              </button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5">
            {renderBudgetForm()}
            {budgetStatusMessage ? <StatusNotice tone="success">{budgetStatusMessage}</StatusNotice> : null}
            {budgetErrorMessage ? <StatusNotice tone="error">{budgetErrorMessage}</StatusNotice> : null}
          </div>
        </ModalFrame>
      ) : null}
    </>
  );
}