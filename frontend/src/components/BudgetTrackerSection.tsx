import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type {
  BankAccount,
  BudgetForm,
  BudgetHistoryGroup,
  BudgetHistoryRange,
  BudgetSummary,
  CategoryOption
} from "../types";
import { ModalFrame, SectionHeader, StatusNotice, SurfaceCard, cn } from "./ui";
import { FilterDropdown } from "./FilterDropdown";
import { CategoryIcon } from "./CategoryIcon";
import { BankPicker, BankLogo } from "./BankPicker";
import { useAuth } from "../hooks/useAuth";
import { listBankAccounts } from "../services/api";
import { History, Landmark } from "lucide-react";

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
  currencySymbol?: string;
  userAccounts?: BankAccount[];
  bankSpends?: Array<{ bankName: string; bankAccountId?: string | null; amount: number }>;
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

/**
 * Returns a gradient or solid color for the progress bar based on how much
 * of the budget has been consumed.
 *
 * Thresholds (percentage of budget spent):
 *   < 20%  → dark green
 *   < 30%  → green
 *   < 40%  → yellow
 *   < 50%  → dark yellow / amber
 *   < 60%  → orange
 *   < 70%  → red
 *   ≥ 70%  → dark red
 */
function getBudgetProgressColor(percent: number): string {
  if (percent < 20) return "#15803d";   // dark green
  if (percent < 30) return "#22c55e";   // green
  if (percent < 40) return "#eab308";   // yellow
  if (percent < 50) return "#ca8a04";   // dark yellow / amber
  if (percent < 60) return "#f97316";   // orange
  if (percent < 70) return "#ef4444";   // red
  return "#991b1b";                     // dark red
}

function getBudgetStatusInfo(percent: number, isOverspent: boolean): { label: string; toneClass: string } {
  if (isOverspent)  return { label: "Over budget", toneClass: "tone-danger" };
  if (percent < 20) return { label: "On track",    toneClass: "tone-positive" };
  if (percent < 30) return { label: "On track",    toneClass: "tone-positive" };
  if (percent < 40) return { label: "Moderate",    toneClass: "tone-warning" };
  if (percent < 50) return { label: "Moderate",    toneClass: "tone-warning" };
  if (percent < 60) return { label: "High usage",  toneClass: "tone-warning" };
  if (percent < 80) return { label: "High usage",  toneClass: "tone-warning" };
  return                    { label: "Critical",    toneClass: "tone-danger" };
}

function getOverviewRemainingStyle(isOverspent: boolean, summaries: BudgetSummary[]): string {
  if (isOverspent) return "border-[color:rgba(154,63,56,0.16)] bg-danger-tint";
  if (summaries.length === 0) return "border-primary/10 bg-success-tint";

  // Use the highest-usage budget to color the overview card
  const maxPercent = Math.max(...summaries.map(getBudgetProgress));
  if (maxPercent < 40) return "border-primary/10 bg-success-tint";
  if (maxPercent < 60) return "border-[color:rgba(202,138,4,0.16)] bg-warning-tint";
  return "border-[color:rgba(154,63,56,0.16)] bg-danger-tint";
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
  onCloseBudgetHistory,
  currencySymbol = "₹",
  userAccounts,
  bankSpends
}: BudgetTrackerSectionProps) {
  const [showBudgetValidation, setShowBudgetValidation] = useState(false);
  const [isMobileEditOpen, setIsMobileEditOpen] = useState(false);
  const [isAllotmentModalOpen, setIsAllotmentModalOpen] = useState(false);
  const [isBudgetFormOpen, setIsBudgetFormOpen] = useState(false);

  useEffect(() => {
    if (editingBudgetId) {
      setIsBudgetFormOpen(true);
    }
  }, [editingBudgetId]);

  // Bank Allotments state
  const { currentUser } = useAuth();
  const [fetchedAccounts, setFetchedAccounts] = useState<BankAccount[]>([]);
  const [bankAllotments, setBankAllotments] = useState<Array<{
    bankName: string;
    bankAccountId?: string;
    bankId?: string;
    accountLabel?: string;
    amount: number;
  }>>(() => {
    try {
      const stored = localStorage.getItem(`bank_allotments_${budgetForm.month}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [isAddingBankAllotment, setIsAddingBankAllotment] = useState(false);
  const [selectedBankAccountIdForBudget, setSelectedBankAccountIdForBudget] = useState<string | null>(null);
  const [selectedBankNameForBudget, setSelectedBankNameForBudget] = useState<string>("");
  const [allotmentAmountInput, setAllotmentAmountInput] = useState("");

  useEffect(() => {
    let isMounted = true;
    if (!userAccounts && currentUser) {
      listBankAccounts(currentUser)
        .then((accounts) => {
          if (isMounted) setFetchedAccounts(accounts);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [userAccounts, currentUser]);

  const activeAccounts: BankAccount[] = userAccounts || fetchedAccounts;

  const saveBankAllotments = (updated: Array<{
    bankName: string;
    bankAccountId?: string;
    bankId?: string;
    accountLabel?: string;
    amount: number;
  }>) => {
    setBankAllotments(updated);
    try {
      localStorage.setItem(`bank_allotments_${budgetForm.month}`, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddBankAllotment = () => {
    const val = parseFloat(allotmentAmountInput);
    if (!val || val <= 0 || !selectedBankNameForBudget) return;

    const matchedAccount = activeAccounts.find(
      (a: BankAccount) =>
        (selectedBankAccountIdForBudget && a.id === selectedBankAccountIdForBudget) ||
        a.bank_name.toLowerCase() === selectedBankNameForBudget.toLowerCase()
    );

    const existingIndex = bankAllotments.findIndex(
      (b) =>
        (b.bankAccountId && selectedBankAccountIdForBudget && b.bankAccountId === selectedBankAccountIdForBudget) ||
        b.bankName.toLowerCase() === selectedBankNameForBudget.toLowerCase()
    );

    const newEntry = {
      bankName: selectedBankNameForBudget,
      bankAccountId: selectedBankAccountIdForBudget || undefined,
      bankId: matchedAccount?.bank_id,
      accountLabel: matchedAccount?.account_label || undefined,
      amount: val
    };

    let nextList = [...bankAllotments];
    if (existingIndex >= 0) {
      nextList[existingIndex] = newEntry;
    } else {
      nextList.push(newEntry);
    }
    saveBankAllotments(nextList);
    setAllotmentAmountInput("");
    setSelectedBankAccountIdForBudget(null);
    setSelectedBankNameForBudget("");
    setIsAddingBankAllotment(false);
  };

  const handleDeleteBankAllotment = (bName: string) => {
    saveBankAllotments(bankAllotments.filter((b) => b.bankName !== bName));
  };

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
        {/* Issue #7: budget-form-field caps max-width so fields feel intentionally narrow */}
        <div className="budget-form-field">
          <FilterDropdown
            label="Budget type"
            variant="form"
            value={budgetForm.scope}
            onChange={(val) => onBudgetFormChange((current) => ({ ...current, scope: val as BudgetForm["scope"] }))}
            options={[
              { value: "monthly", label: "Monthly budget" },
              { value: "category", label: "Category budget" },
            ]}
          />
        </div>

        <label className="grid gap-2 text-sm font-medium text-secondary budget-form-field">
          <span className="required-mark">Amount</span>
          <div className="relative">
            <input type="number" className="pl-8" min="0.01" step="0.01" required value={budgetForm.amount} onChange={(event) => onBudgetFormChange((current) => ({ ...current, amount: event.target.value }))} aria-invalid={showBudgetValidation && Boolean(budgetErrors.amount)} />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 z-10">
              {currencySymbol}
            </span>
          </div>
          {showBudgetValidation && budgetErrors.amount ? <span className="text-sm text-[color:var(--danger-text)]">{budgetErrors.amount}</span> : null}
        </label>

        <label className="grid gap-2 text-sm font-medium text-secondary budget-form-field">
          <span className="required-mark">Month</span>
          <input type="month" required value={budgetForm.month} onChange={(event) => onBudgetFormChange((current) => ({ ...current, month: event.target.value }))} aria-invalid={showBudgetValidation && Boolean(budgetErrors.month)} />
          {showBudgetValidation && budgetErrors.month ? <span className="text-sm text-[color:var(--danger-text)]">{budgetErrors.month}</span> : null}
        </label>

        {budgetForm.scope === "category" ? (
          <div className="budget-form-field">
            <FilterDropdown
              label="Category"
              variant="form"
              required
              searchable
              value={budgetForm.category}
              placeholder="Select category"
              error={showBudgetValidation && budgetErrors.category ? budgetErrors.category : undefined}
              onChange={(val) => onBudgetFormChange((current) => ({ ...current, category: val }))}
              options={budgetCategoryOptions.map((option) => ({
                value: option.label,
                label: option.label,
                icon: <CategoryIcon iconId={option.icon} />,
              }))}
            />
          </div>
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
      <section className="w-full">
        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            title={sectionTitle}
            description={sectionDescription}
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium rounded-lg transition",
                    isBudgetFormOpen ? "ui-button-secondary" : "ui-button-primary"
                  )}
                  onClick={() => setIsBudgetFormOpen(!isBudgetFormOpen)}
                >
                  <span>{isBudgetFormOpen ? "✕ Close Form" : "+ Set / Edit Budget"}</span>
                </button>
                <button
                  type="button"
                  className="ui-button-secondary shrink-0 whitespace-nowrap text-xs px-2.5 py-1.5 flex items-center gap-1"
                  onClick={onOpenBudgetHistory}
                >
                  <History className="size-3.5" />
                  <span>{historyTriggerLabel}</span>
                </button>
              </div>
            }
          />

          {(isBudgetFormOpen || editingBudgetId) && (
            <div className="rounded-[22px] border border-primary/20 bg-primary/[0.03] p-4 sm:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {editingBudgetId ? "Edit budget" : "Set a new budget limit"}
                  </h3>
                  <p className="text-xs text-muted">
                    {formDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsBudgetFormOpen(false);
                    if (editingBudgetId) handleValidatedBudgetEditCancel();
                  }}
                  className="text-xs text-muted hover:text-ink px-2 py-1"
                >
                  ✕ Close
                </button>
              </div>
              {renderBudgetForm()}
              {budgetStatusMessage ? <StatusNotice tone="success">{budgetStatusMessage}</StatusNotice> : null}
              {budgetErrorMessage ? <StatusNotice tone="error">{budgetErrorMessage}</StatusNotice> : null}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl sm:rounded-[22px] border border-[color:var(--border)] bg-white/80 p-2.5 sm:p-4 shadow-sm text-center sm:text-left">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted truncate">Budgeted</p>
              <strong className="mt-1 sm:mt-2 block text-sm sm:text-xl font-bold text-ink truncate">{currentMonthBudgetOverview.totalBudget}</strong>
            </div>
            <div className="rounded-xl sm:rounded-[22px] border border-[color:var(--border)] bg-white/80 p-2.5 sm:p-4 shadow-sm text-center sm:text-left">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted truncate">Spent</p>
              <strong className="mt-1 sm:mt-2 block text-sm sm:text-xl font-bold text-ink truncate">{currentMonthBudgetOverview.totalSpent}</strong>
            </div>
            <div className={cn("rounded-xl sm:rounded-[22px] border p-2.5 sm:p-4 shadow-sm text-center sm:text-left", getOverviewRemainingStyle(currentMonthBudgetOverview.isOverspent, currentMonthBudgetSummaries))}>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted truncate">Remaining</p>
              <strong className="mt-1 sm:mt-2 block text-sm sm:text-xl font-bold text-ink truncate">{currentMonthBudgetOverview.totalRemaining}</strong>
            </div>
          </div>

          {/* Bank Budget Allotments Under Total Budget */}
          <div className="rounded-[22px] border border-[color:var(--border)] bg-gradient-to-br from-white/95 to-slate-50/70 p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold tracking-tight text-ink flex items-center gap-1.5">
                  <Landmark className="size-3.5 text-primary" /> Bank Budget Allotments
                </span>
                <p className="text-[11px] text-muted">
                  Designate individual monthly spending caps for your banks under the overall budget.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {bankAllotments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsAllotmentModalOpen(true)}
                    className="ui-button-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                    title="View detailed bank allotment breakdown"
                  >
                    <span>📊 Breakdown</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsAddingBankAllotment(!isAddingBankAllotment)}
                  className="ui-button-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                >
                  <span>{isAddingBankAllotment ? "✕ Cancel" : "+ Add Bank Allotment"}</span>
                </button>
              </div>
            </div>

            {isAddingBankAllotment && (
              activeAccounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center space-y-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    No saved bank accounts found
                  </p>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    Please add your bank accounts or cards in your profile first before allotting monthly budget caps.
                  </p>
                  <Link
                    to="/profile"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 transition shadow-xs"
                  >
                    Go to Profile to Add Bank →
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 items-start">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-secondary">Select Saved Account / Card</span>
                      <BankPicker
                        userAccounts={activeAccounts}
                        selectedBankAccountId={selectedBankAccountIdForBudget}
                        selectedBankName={selectedBankNameForBudget}
                        onChange={(id, name) => {
                          setSelectedBankAccountIdForBudget(id);
                          setSelectedBankNameForBudget(name || "");
                        }}
                        label=""
                      />
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-secondary">
                      <span>Monthly Allotment Amount ({currencySymbol})</span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="e.g. 25000"
                        className="h-[42px] rounded-xl border border-[color:var(--border)] bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                        value={allotmentAmountInput}
                        onChange={(e) => setAllotmentAmountInput(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingBankAllotment(false);
                        setSelectedBankAccountIdForBudget(null);
                        setSelectedBankNameForBudget("");
                        setAllotmentAmountInput("");
                      }}
                      className="ui-button-secondary text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBankAllotment}
                      className="ui-button-primary text-xs px-3 py-1.5"
                      disabled={!selectedBankNameForBudget || !parseFloat(allotmentAmountInput)}
                    >
                      Save Allotment
                    </button>
                  </div>
                </div>
              )
            )}

            {bankAllotments.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-2 italic">
                No bank allotments set for this month yet. Click "+ Add Bank Allotment" to allocate your budget.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-white/70 dark:bg-zinc-800/50 px-4 py-2.5 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {bankAllotments.slice(0, 4).map((a, idx) => (
                      <div key={idx} className="inline-block ring-2 ring-white dark:ring-zinc-800 rounded-full shadow-2xs">
                        <BankLogo bankId={a.bankId} bankName={a.bankName} size="xs" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-ink">
                      {bankAllotments.length} {bankAllotments.length === 1 ? "Bank / Card Allotment Active" : "Banks / Cards Allotted"}
                    </span>
                    <p className="text-[11px] text-muted">
                      Total Allocated: <strong className="text-ink font-semibold">{currencySymbol}{bankAllotments.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAllotmentModalOpen(true)}
                  className="ui-button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium"
                >
                  <span>📊 View Breakdown</span>
                </button>
              </div>
            )}
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
                        <span className={cn("data-pill", getBudgetStatusInfo(getBudgetProgress(budget), budget.isOverspent).toneClass)}>{getBudgetStatusInfo(getBudgetProgress(budget), budget.isOverspent).label}</span>
                      </div>
                      <p className="text-sm leading-6 text-secondary">
                        {budget.scope === "monthly" ? `Applies to all categories in ${currentBudgetMonthLabel}.` : `Tracks ${budget.category} spend for ${currentBudgetMonthLabel}.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ui-button-secondary" onClick={() => handleEditStart(budget)}>
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
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(getBudgetProgress(budget), 6)}%`, backgroundColor: getBudgetProgressColor(getBudgetProgress(budget)) }} />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: getBudgetProgressColor(getBudgetProgress(budget)) }}>{getBudgetProgress(budget).toFixed(0)}% used</p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
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
                <div className="w-full sm:w-44">
                  <FilterDropdown
                    label="Range"
                    value={budgetHistoryRange}
                    onChange={(val) => onBudgetHistoryRangeChange(val as BudgetHistoryRange)}
                    options={[
                      { value: "quarter", label: "Last 3 months" },
                      { value: "half-year", label: "Last 6 months" },
                      { value: "year", label: "Last 12 months" },
                      { value: "all", label: "All time" },
                    ]}
                  />
                </div>
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
                              className="ui-button-secondary"
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
      {isAllotmentModalOpen ? (
        <ModalFrame onClose={() => setIsAllotmentModalOpen(false)} className="flex max-h-[92vh] max-w-2xl flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink">
                  Bank Budget Breakdown
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Overview of spending limits and current utilization per bank / card for this month.
                </p>
              </div>
              <button
                type="button"
                className="ui-button-secondary shrink-0"
                onClick={() => setIsAllotmentModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-6 space-y-5">
            {/* Summary metrics */}
            {(() => {
              const totalAllotted = bankAllotments.reduce((sum, a) => sum + a.amount, 0);
              const totalSpent = bankAllotments.reduce((sum, a) => {
                const item = bankSpends?.find(
                  (s) =>
                    (a.bankAccountId && s.bankAccountId === a.bankAccountId) ||
                    s.bankName.toLowerCase() === a.bankName.toLowerCase() ||
                    (a.accountLabel && s.bankName.toLowerCase() === a.accountLabel.toLowerCase())
                );
                return sum + (item?.amount ?? 0);
              }, 0);
              const isOver = totalSpent > totalAllotted;
              const overallPercent = totalAllotted > 0 ? (totalSpent / totalAllotted) * 100 : 0;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-[color:var(--border)] bg-surface p-3.5 shadow-2xs">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Allotted</span>
                    <p className="text-lg font-bold text-ink mt-1">{currencySymbol}{totalAllotted.toLocaleString()}</p>
                    <span className="text-[10px] text-muted">{bankAllotments.length} accounts configured</span>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-surface p-3.5 shadow-2xs">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Spent</span>
                    <p className="text-lg font-bold text-ink mt-1">{currencySymbol}{totalSpent.toLocaleString()}</p>
                    <span className="text-[10px] text-muted">{overallPercent.toFixed(0)}% of total allotment</span>
                  </div>
                  <div className={cn(
                    "rounded-2xl border p-3.5 shadow-2xs",
                    isOver ? "border-rose-500/30 bg-rose-500/5 text-rose-600" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                  )}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                      {isOver ? "Over Budget" : "Remaining"}
                    </span>
                    <p className="text-lg font-bold mt-1">
                      {currencySymbol}{Math.abs(totalAllotted - totalSpent).toLocaleString()}
                    </p>
                    <span className="text-[10px] opacity-80">
                      {isOver ? "Limit exceeded across cards" : "Available to spend"}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* List of cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Card & Account Details</h3>
              {bankAllotments.length === 0 ? (
                <p className="text-xs text-muted italic">No bank budget allotments configured for this month.</p>
              ) : (
                <div className="grid gap-3">
                  {bankAllotments.map((allotment) => {
                    const spendItem = bankSpends?.find(
                      (s) =>
                        (allotment.bankAccountId && s.bankAccountId === allotment.bankAccountId) ||
                        s.bankName.toLowerCase() === allotment.bankName.toLowerCase() ||
                        (allotment.accountLabel && s.bankName.toLowerCase() === allotment.accountLabel.toLowerCase())
                    );
                    const spent = spendItem?.amount ?? 0;
                    const total = allotment.amount;
                    const percent = total > 0 ? (spent / total) * 100 : 0;
                    const isOver = spent > total;
                    const progressColor = getBudgetProgressColor(percent);

                    return (
                      <div
                        key={allotment.bankAccountId || allotment.bankName}
                        className="rounded-2xl border border-[color:var(--border)] bg-surface p-4 space-y-3 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <BankLogo bankId={allotment.bankId} bankName={allotment.bankName} size="md" />
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-ink truncate">
                                {allotment.accountLabel || allotment.bankName}
                              </h4>
                              {allotment.accountLabel && allotment.accountLabel !== allotment.bankName && (
                                <p className="text-xs text-muted truncate">{allotment.bankName}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold text-ink">
                                {currencySymbol}{total.toLocaleString()}
                              </p>
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5",
                                isOver
                                  ? "bg-rose-500/10 text-rose-600"
                                  : percent >= 80
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-emerald-500/10 text-emerald-600"
                              )}>
                                {isOver ? `Over by ${currencySymbol}${(spent - total).toLocaleString()}` : `${percent.toFixed(0)}% used`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteBankAllotment(allotment.bankName)}
                              className="text-xs text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                              title="Delete allotment"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Thin progress bar */}
                        <div className="space-y-1.5">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(spent > 0 ? 3 : 0, percent))}%`,
                                backgroundColor: progressColor,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted">
                            <span>
                              Spent: <strong className="font-semibold text-ink">{currencySymbol}{spent.toLocaleString()}</strong>
                            </span>
                            <span>
                              {isOver ? (
                                <span className="text-rose-500 font-semibold">Exceeded limit</span>
                              ) : (
                                <span>Remaining: <strong className="font-semibold text-ink">{currencySymbol}{(total - spent).toLocaleString()}</strong></span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </>
  );
}