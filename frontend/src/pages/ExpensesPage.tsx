import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CategoryIcon } from "../components/CategoryIcon";
import { PlatformPicker } from "../components/PlatformPicker";
import { BankPicker, BankLogo } from "../components/BankPicker";
import { PLATFORMS } from "../lib/platforms";
import { EmptyState, ItemActionButtons, ModalFrame, StatusNotice, SurfaceCard, cn } from "../components/ui";
import { FilterDropdown } from "../components/FilterDropdown";
import { ReceiptScanPanel } from "../components/ReceiptScanPanel";
import { Plus, Trash2, RotateCcw, X, Receipt } from "lucide-react";
import type { CategoryOption, Expense, ExpenseForm, TimeRangeFilter } from "../types";
import { formatBudgetMonth } from "../utils/format";

type ExpensesPageProps = {
  currentUserPresent: boolean;
  authLoading: boolean;
  form: ExpenseForm;
  editingExpenseId: string | null;
  isSubmitting: boolean;
  statusMessage: string;
  errorMessage: string;
  customCategoryName: string;
  selectedCategory: string;
  selectedTimeRange: TimeRangeFilter;
  selectedPlatform: string;
  sortNewestFirst: boolean;
  categories: string[];
  expenseMonthOptions: string[];
  visibleExpenses: Expense[];
  totalVisibleExpenses: number;
  currentExpensesPage: number;
  totalExpensePages: number;
  expensesPageSize: number;
  availableCategoryOptions: CategoryOption[];
  selectedCategoryOption: CategoryOption | null;
  isOtherCategorySelected: boolean;
  selectedExpenseIds: string[];
  selectedVisibleExpenseIds: string[];
  areAllVisibleExpensesSelected: boolean;
  deletingExpenseIds: string[];
  isLoading: boolean;
  formatCurrency: (amount: string) => string;
  resolveCategoryIcon: (categoryLabel: string, categoryOptions: CategoryOption[]) => string;
  onFormChange: (updater: (current: ExpenseForm) => ExpenseForm) => void;
  onCategorySelect: (category: CategoryOption) => void;
  onCustomCategoryNameChange: (value: string) => void;
  onCreateCustomCategory: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onEditCancel: () => void;
  onSelectedCategoryChange: (value: string) => void;
  onSortNewestFirstChange: (value: boolean) => void;
  onSelectedTimeRangeChange: (range: TimeRangeFilter) => void;
  onSelectedPlatformChange: (platform: string) => void;
  onExpensesPageChange: (page: number) => void;
  onDeleteSelectedExpenses: () => Promise<void>;
  onToggleSelectAllVisibleExpenses: () => void;
  onToggleExpenseSelection: (expenseId: string) => void;
  onEditStart: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  onClearFilters: () => void;
  currencySymbol?: string;
};

function getTodayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayValue(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

export function ExpensesPage({
  currentUserPresent,
  authLoading,
  form,
  editingExpenseId,
  isSubmitting,
  statusMessage,
  errorMessage,
  customCategoryName,
  selectedCategory,
  selectedTimeRange,
  selectedPlatform,
  sortNewestFirst,
  categories,
  expenseMonthOptions,
  visibleExpenses,
  totalVisibleExpenses,
  currentExpensesPage,
  totalExpensePages,
  expensesPageSize,
  availableCategoryOptions,
  selectedCategoryOption,
  isOtherCategorySelected,
  selectedExpenseIds,
  selectedVisibleExpenseIds,
  areAllVisibleExpensesSelected,
  deletingExpenseIds,
  isLoading,
  formatCurrency,
  resolveCategoryIcon,
  onFormChange,
  onCategorySelect,
  onCustomCategoryNameChange,
  onCreateCustomCategory,
  onSubmit,
  onEditCancel,
  onSelectedCategoryChange,
  onSortNewestFirstChange,
  onSelectedTimeRangeChange,
  onSelectedPlatformChange,
  onExpensesPageChange,
  onDeleteSelectedExpenses,
  onToggleSelectAllVisibleExpenses,
  onToggleExpenseSelection,
  onEditStart,
  onDeleteExpense,
  onClearFilters,
  currencySymbol = "₹"
}: ExpensesPageProps) {
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(Boolean(editingExpenseId));
  const [showValidation, setShowValidation] = useState(false);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "single" | "selected";
    expenseId?: string;
    description: string;
    amount?: string;
  } | null>(null);

  useEffect(() => {
    if (editingExpenseId) {
      setIsExpenseFormOpen(true);
    }
  }, [editingExpenseId]);

  function handleEditStart(expense: Parameters<typeof onEditStart>[0]) {
    onEditStart(expense);
    setIsExpenseFormOpen(true);
    setIsExpenseSheetOpen(true);
    setShowValidation(false);
  }

  function handleEditCancel() {
    onEditCancel();
    setIsExpenseFormOpen(false);
    setIsExpenseSheetOpen(false);
    setShowValidation(false);
  }

  function handleScanComplete(data: { amount: string; description: string; date: string; category?: string; platform?: string }) {
    onFormChange((current) => ({
      ...current,
      amount: data.amount,
      description: data.description,
      date: data.date,
      platform: data.platform || ""
    }));
    if (data.category) {
      const match = availableCategoryOptions.find((opt) => opt.label.toLowerCase() === data.category!.toLowerCase());
      if (match) {
        onCategorySelect(match);
      }
    }
  }

  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const pageStart = totalVisibleExpenses === 0 ? 0 : (currentExpensesPage - 1) * expensesPageSize + 1;
  const pageEnd = totalVisibleExpenses === 0 ? 0 : Math.min(currentExpensesPage * expensesPageSize, totalVisibleExpenses);
  
  const validationErrors = useMemo(() => {
    const errors = {
      amount: "",
      category: "",
      description: "",
      date: ""
    };

    const amountTrimmed = form.amount.trim();
    if (!amountTrimmed) {
      errors.amount = "Please enter the expense amount.";
    } else {
      const amountNum = parseFloat(amountTrimmed);
      if (isNaN(amountNum) || amountNum <= 0) {
        errors.amount = "Amount must be a positive number.";
      }
    }

    if (!form.category.trim()) {
      errors.category = "Please select a category.";
    }

    const descTrimmed = form.description.trim();
    if (!descTrimmed) {
      errors.description = "Please enter a description.";
    } else if (descTrimmed.length < 3) {
      errors.description = "Description must be at least 3 characters long.";
    }

    if (!form.date.trim()) {
      errors.date = "Please select a date.";
    }

    return errors;
  }, [form.amount, form.category, form.date, form.description]);

  const hasValidationErrors = Object.values(validationErrors).some(Boolean);
  const activeFilters = [
    selectedCategory ? `Category: ${selectedCategory}` : null,
    selectedTimeRange !== "all"
      ? /^\d{4}-\d{2}$/.test(selectedTimeRange)
        ? `Month: ${formatBudgetMonth(selectedTimeRange)}`
        : `Range: ${selectedTimeRange}`
      : null,
    selectedPlatform ? `Platform: ${selectedPlatform === "none" ? "None" : (PLATFORMS.find(p => p.id === selectedPlatform)?.name ?? selectedPlatform)}` : null,
    !sortNewestFirst ? "Sort: created order" : null
  ].filter(Boolean) as string[];

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    setShowValidation(true);

    if (hasValidationErrors) {
      event.preventDefault();
      Object.values(validationErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    await onSubmit(event);
    setShowValidation(false);
    setIsExpenseFormOpen(false);
    setIsExpenseSheetOpen(false);
  }

  function handleFieldAdvance(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, nextField: HTMLTextAreaElement | HTMLInputElement | null) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    nextField?.focus();
  }

  const handleDeleteClick = (expense: Expense) => {
    setDeleteConfirmation({
      type: "single",
      expenseId: expense.id,
      description: expense.description,
      amount: formatCurrency(expense.amount),
    });
  };

  const handleDeleteSelectedClick = () => {
    if (selectedVisibleExpenseIds.length === 0) return;
    setDeleteConfirmation({
      type: "selected",
      description: `${selectedVisibleExpenseIds.length} selected ${selectedVisibleExpenseIds.length === 1 ? "expense" : "expenses"}`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, expenseId } = deleteConfirmation;
    setDeleteConfirmation(null);
    if (type === "single" && expenseId) {
      await onDeleteExpense(expenseId);
    } else if (type === "selected") {
      await onDeleteSelectedExpenses();
    }
  };

  function renderExpenseForm(isSheet = false) {
    return (
      <SurfaceCard className={cn("space-y-4 p-4 sm:p-5 shadow-2xs", isSheet && "border-none bg-transparent p-0 shadow-none")}>
        <div className="flex items-center justify-between pb-2 border-b border-[color:var(--border)]/60">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-ink">
              {editingExpenseId ? "Edit Expense" : "Add New Expense"}
            </h3>
            <p className="text-xs text-muted">
              {editingExpenseId
                ? "Update amount, category, or account details."
                : "Fill in the details or scan a receipt to auto-populate."}
            </p>
          </div>
          {!isSheet && (
            <button
              type="button"
              className="p-1 rounded-lg text-secondary hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              onClick={() => {
                if (editingExpenseId) handleEditCancel();
                else setIsExpenseFormOpen(false);
              }}
              title="Close form"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {!editingExpenseId && (
          <ReceiptScanPanel
            onScanComplete={handleScanComplete}
          />
        )}

        <form className="grid gap-3.5" onSubmit={(event) => void handleFormSubmit(event)} noValidate>
          {/* Row 1: Amount & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            <label className="grid gap-1.5 text-xs font-semibold text-secondary">
              <span className="required-mark">Amount</span>
              <div className="relative">
                <input
                  type="number"
                  className="pl-8 h-[38px] text-sm"
                  min="0.01"
                  step="0.01"
                  required
                  autoFocus={!editingExpenseId}
                  inputMode="decimal"
                  disabled={!currentUserPresent}
                  value={form.amount}
                  aria-invalid={showValidation && Boolean(validationErrors.amount)}
                  onChange={(event) => onFormChange((current) => ({ ...current, amount: event.target.value }))}
                  onKeyDown={(event) => handleFieldAdvance(event, descriptionInputRef.current)}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 z-10">
                  {currencySymbol}
                </span>
              </div>
              {showValidation && validationErrors.amount ? <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.amount}</span> : null}
            </label>

            <div className="grid gap-1.5">
              <FilterDropdown
                label="Category"
                variant="form"
                required
                value={selectedCategoryOption?.label ?? ""}
                placeholder="Select a category"
                disabled={!currentUserPresent}
                searchable
                error={showValidation && validationErrors.category ? validationErrors.category : undefined}
                onChange={(val) => {
                  const match = availableCategoryOptions.find((option) => option.label === val);
                  if (match) {
                    onCategorySelect(match);
                    requestAnimationFrame(() => descriptionInputRef.current?.focus());
                  }
                }}
                options={availableCategoryOptions.map((category) => ({
                  value: category.label,
                  label: category.label,
                  icon: <CategoryIcon iconId={category.icon} />,
                }))}
              />
            </div>
          </div>

          {isOtherCategorySelected ? (
            <SurfaceCard className="space-y-2 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,243,232,0.8))] p-3 shadow-sm">
              <div>
                <strong className="text-xs font-semibold text-ink">Need another category?</strong>
                <p className="text-[11px] leading-4 text-secondary">Type a category name and we'll pick a matching icon automatically.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input type="text" className="h-[36px] text-xs" placeholder="Write your category name" disabled={!currentUserPresent} value={customCategoryName} onChange={(event) => onCustomCategoryNameChange(event.target.value)} />
                <button type="button" className="ui-button-secondary text-xs px-3 py-1.5" onClick={onCreateCustomCategory}>
                  Add category
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          {/* Row 2: Platform / Source & Bank Account / Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-secondary">Platform / Source</span>
              <div className="flex items-center gap-3">
                <PlatformPicker
                  value={form.platform ?? null}
                  onChange={(platform) => onFormChange((current) => ({ ...current, platform }))}
                  disabled={!currentUserPresent}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-secondary">Bank Account / Card (Optional)</span>
              <BankPicker
                selectedBankAccountId={form.bankAccountId ?? null}
                selectedBankName={form.bankName ?? null}
                onChange={(bankAccountId, bankName) =>
                  onFormChange((current) => ({
                    ...current,
                    bankAccountId,
                    bankName
                  }))
                }
                disabled={!currentUserPresent}
              />
            </div>
          </div>

          {/* Row 3: Description */}
          <label className="grid gap-1.5 text-xs font-semibold text-secondary">
            <span className="required-mark">Description</span>
            <textarea
              ref={descriptionInputRef}
              required
              rows={2}
              className="text-sm py-2"
              disabled={!currentUserPresent}
              value={form.description}
              placeholder="What was this expense for?"
              aria-invalid={showValidation && Boolean(validationErrors.description)}
              onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))}
              onKeyDown={(event) => handleFieldAdvance(event, dateInputRef.current)}
            />
            {showValidation && validationErrors.description ? <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.description}</span> : null}
          </label>

          {/* Row 4: Date & Quick chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5 items-end">
            <label className="grid gap-1.5 text-xs font-semibold text-secondary">
              <span className="required-mark">Date</span>
              <input
                ref={dateInputRef}
                type="date"
                required
                className="h-[38px] text-sm"
                disabled={!currentUserPresent}
                value={form.date}
                aria-invalid={showValidation && Boolean(validationErrors.date)}
                onChange={(event) => onFormChange((current) => ({ ...current, date: event.target.value }))}
              />
              {showValidation && validationErrors.date ? <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.date}</span> : null}
            </label>

            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                className={cn(
                  "ui-button-ghost text-xs px-2.5 py-1.5 h-[38px]",
                  form.date === getTodayValue() && "bg-primary/10 text-primary font-semibold border border-primary/20"
                )}
                onClick={() => onFormChange((current) => ({ ...current, date: getTodayValue() }))}
              >
                Today
              </button>
              <button
                type="button"
                className={cn(
                  "ui-button-ghost text-xs px-2.5 py-1.5 h-[38px]",
                  form.date === getYesterdayValue() && "bg-primary/10 text-primary font-semibold border border-primary/20"
                )}
                onClick={() => onFormChange((current) => ({ ...current, date: getYesterdayValue() }))}
              >
                Yesterday
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[color:var(--border)]/60">
            {editingExpenseId ? (
              <button type="button" className="ui-button-secondary text-xs px-3.5 py-1.5" onClick={handleEditCancel}>
                Cancel edit
              </button>
            ) : (
              <button
                type="button"
                className="ui-button-ghost text-xs px-3 py-1.5"
                onClick={() => {
                  if (isSheet) setIsExpenseSheetOpen(false);
                  else setIsExpenseFormOpen(false);
                }}
              >
                Cancel
              </button>
            )}
            <button type="submit" className="ui-button-primary text-xs px-4 py-1.5 shadow-sm" disabled={isSubmitting || !currentUserPresent}>
              {isSubmitting ? (editingExpenseId ? "Updating..." : "Saving...") : editingExpenseId ? "Update expense" : "Save expense"}
            </button>
          </div>

          {statusMessage ? <StatusNotice tone="success">{statusMessage}</StatusNotice> : null}
          {errorMessage ? <StatusNotice tone="error">{errorMessage}</StatusNotice> : null}
        </form>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sleek Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Expenses
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <Receipt className="size-3" />
              <span>{totalVisibleExpenses} total</span>
            </span>
            {isLoading && (
              <span className="text-[11px] font-medium text-muted flex items-center gap-1 animate-pulse">
                • Loading...
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Capture, review, and refine your spending ledger with quick filtering.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={cn(
              "ui-button-primary text-xs px-3.5 py-1.5 hidden lg:inline-flex items-center gap-1.5 shadow-sm transition-all",
              (isExpenseFormOpen || editingExpenseId) && "bg-secondary text-ink border border-[color:var(--border)] shadow-none"
            )}
            onClick={() => {
              if (editingExpenseId) {
                handleEditCancel();
              } else {
                setIsExpenseFormOpen((prev) => !prev);
              }
            }}
          >
            {isExpenseFormOpen || editingExpenseId ? (
              <>
                <X className="size-3.5" />
                <span>Close form</span>
              </>
            ) : (
              <>
                <Plus className="size-3.5" />
                <span>Add expense</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Add / Edit Expense Form */}
      {(isExpenseFormOpen || editingExpenseId) && (
        <div className="relative z-20 transition-all duration-200">
          {renderExpenseForm(false)}
        </div>
      )}

      {/* Sleek Compact Filter Toolbar */}
      <SurfaceCard className="p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
              <FilterDropdown
                label="Category"
                value={selectedCategory}
                placeholder="All categories"
                disabled={!currentUserPresent}
                onChange={onSelectedCategoryChange}
                searchable
                options={[
                  { value: "", label: "All categories" },
                  ...categories.map((category) => {
                    const match = availableCategoryOptions.find(
                      (opt) => opt.label.toLowerCase() === category.toLowerCase()
                    );
                    return {
                      value: category,
                      label: category,
                      icon: match ? <CategoryIcon iconId={match.icon} /> : undefined,
                    };
                  }),
                ]}
              />

              <FilterDropdown
                label="Platform"
                value={selectedPlatform}
                placeholder="All platforms"
                disabled={!currentUserPresent}
                onChange={onSelectedPlatformChange}
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

              <FilterDropdown
                label="Month"
                value={selectedTimeRange}
                placeholder="All months"
                disabled={!currentUserPresent}
                onChange={(val) => onSelectedTimeRangeChange(val as TimeRangeFilter)}
                searchable={expenseMonthOptions.length > 6}
                options={[
                  { value: "all", label: "All months" },
                  ...expenseMonthOptions.map((m) => ({
                    value: m,
                    label: formatBudgetMonth(m),
                  })),
                ]}
              />

              <FilterDropdown
                label="Sort"
                value={sortNewestFirst ? "date_desc" : "none"}
                disabled={!currentUserPresent}
                onChange={(val) => onSortNewestFirstChange(val === "date_desc")}
                options={[
                  { value: "date_desc", label: "Newest first" },
                  { value: "none", label: "Created order" },
                ]}
              />
            </div>

            {/* Clear filters button if any active */}
            {activeFilters.length > 0 && (
              <div className="flex sm:self-end pb-0.5">
                <button
                  type="button"
                  className="ui-button-ghost text-xs px-2.5 py-1.5 h-[38px] flex items-center gap-1.5 text-secondary hover:text-ink"
                  onClick={onClearFilters}
                  title="Reset all filters"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 pt-1 border-t border-[color:var(--border)]/50 text-[11px] text-muted overflow-x-auto">
              <span className="font-semibold text-secondary shrink-0">Active:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeFilters.map((f, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[color:var(--border)] text-ink text-[11px]">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Transaction Ledger Table & Cards */}
      <SurfaceCard className="relative z-0 space-y-3.5 p-4 sm:p-5 shadow-2xs mb-16 lg:mb-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-1">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-ink">
                Transaction Ledger
              </h2>
              {totalVisibleExpenses > 0 && (
                <span className="text-xs text-muted font-medium">
                  ({pageStart}–{pageEnd} of {totalVisibleExpenses})
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              Select multiple expenses for bulk actions or click a row to edit.
            </p>
          </div>
        </div>

        {!currentUserPresent && !authLoading ? <EmptyState title="Sign in to view expenses" description="Your private expense history only appears after authentication." /> : null}
        {currentUserPresent && isLoading ? <StatusNotice tone="neutral">Loading expenses...</StatusNotice> : null}
        {currentUserPresent && !isLoading && visibleExpenses.length === 0 ? <EmptyState title="No expenses match the current filters" description="Adjust the filters or add a new expense to bring this list back to life." /> : null}

        {currentUserPresent && !isLoading && visibleExpenses.length > 0 ? (
          <>
            {/* Top Toolbar: Select All + Bulk Actions + Prev & Next Pagination (same as Wallets section) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[color:var(--border)] bg-zinc-50/75 dark:bg-zinc-800/50 px-3 py-2">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  aria-label={areAllVisibleExpensesSelected ? "Deselect all visible expenses" : "Select all visible expenses"}
                  checked={areAllVisibleExpensesSelected}
                  onChange={onToggleSelectAllVisibleExpenses}
                />
                <span className="text-xs font-semibold text-ink">Select All</span>
                <span className="text-xs text-secondary">
                  {selectedVisibleExpenseIds.length > 0 ? `(${selectedVisibleExpenseIds.length} selected)` : ""}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedVisibleExpenseIds.length > 0 ? (
                  <button
                    type="button"
                    className="ui-button-danger !py-1 !px-2.5 text-xs flex items-center gap-1.5"
                    disabled={selectedVisibleExpenseIds.some((expenseId) => deletingExpenseIds.includes(expenseId))}
                    onClick={handleDeleteSelectedClick}
                  >
                    <Trash2 className="size-3.5" />
                    <span>{selectedVisibleExpenseIds.some((expenseId) => deletingExpenseIds.includes(expenseId)) ? "Deleting..." : "Delete selected"}</span>
                  </button>
                ) : null}

                {totalExpensePages > 1 ? (
                  <div className="flex items-center gap-1 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                    <button
                      type="button"
                      className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[70px] text-xs !py-1 !px-2"
                      disabled={currentExpensesPage === 1}
                      onClick={() => onExpensesPageChange(currentExpensesPage - 1)}
                      title="Previous Page"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 sm:mr-1">
                        <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                      </svg>
                      <span className="hidden sm:inline">Prev</span>
                    </button>
                    <span className="text-xs font-semibold text-secondary px-1 text-center min-w-[40px]">
                      {currentExpensesPage}/{totalExpensePages}
                    </span>
                    <button
                      type="button"
                      className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[70px] text-xs !py-1 !px-2"
                      disabled={currentExpensesPage === totalExpensePages}
                      onClick={() => onExpensesPageChange(currentExpensesPage + 1)}
                      title="Next Page"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 sm:ml-1">
                        <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1 1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-[20px] border border-[color:var(--border)] lg:block">
              <table className="bg-white/80 [&_th]:py-2.5 [&_td]:py-2.5 [&_th]:px-3.5 [&_td]:px-3.5 [&_td]:align-middle">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" aria-label={areAllVisibleExpensesSelected ? "Deselect all visible expenses" : "Select all visible expenses"} checked={areAllVisibleExpensesSelected} onChange={onToggleSelectAllVisibleExpenses} />
                    </th>
                    <th className="w-28">Date</th>
                    <th>Category & Instrument</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right w-24 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className={cn(
                        "cursor-pointer hover:bg-white transition-colors",
                        deletingExpenseIds.includes(expense.id) && "animate-delete-row"
                      )}
                      onClick={() => handleEditStart(expense)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${expense.description}`}
                          checked={selectedExpenseIds.includes(expense.id)}
                          disabled={deletingExpenseIds.includes(expense.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => onToggleExpenseSelection(expense.id)}
                        />
                      </td>
                      <td className="text-xs text-secondary whitespace-nowrap">{expense.date}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-success-tint text-ink shadow-2xs shrink-0">
                            <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-secondary whitespace-nowrap">
                            {expense.category}
                          </span>
                          {expense.platform ? (
                            <PlatformPicker value={expense.platform} onChange={null} className="shrink-0" />
                          ) : null}
                          {expense.bank_name ? (
                            <div className="flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white/90 px-2 py-0.5 text-xs text-secondary shadow-2xs">
                              <BankLogo bankName={expense.bank_name} size="xs" />
                              <span className="font-medium text-[11px] truncate max-w-[90px]">{expense.bank_name}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <strong className="block text-sm text-ink truncate max-w-[320px]">{expense.description}</strong>
                      </td>
                      <td className="text-right text-base font-semibold text-ink whitespace-nowrap">{formatCurrency(expense.amount)}</td>
                      <td className="text-right whitespace-nowrap">
                        <ItemActionButtons
                          className="justify-end"
                          description={expense.description}
                          isDeleting={deletingExpenseIds.includes(expense.id)}
                          onEdit={(event) => {
                            event.stopPropagation();
                            handleEditStart(expense);
                          }}
                          onDelete={(event) => {
                            event.stopPropagation();
                            handleDeleteClick(expense);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2.5 lg:hidden">
              {visibleExpenses.map((expense) => (
                <article
                  key={expense.id}
                  className={cn(
                    "table-card-mobile p-3.5 space-y-2.5 rounded-[18px]",
                    deletingExpenseIds.includes(expense.id) && "animate-delete"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${expense.description}`}
                        checked={selectedExpenseIds.includes(expense.id)}
                        disabled={deletingExpenseIds.includes(expense.id)}
                        onChange={() => onToggleExpenseSelection(expense.id)}
                        className="mt-1"
                      />
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-success-tint text-ink shadow-2xs shrink-0">
                        <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {expense.platform ? (
                          <PlatformPicker value={expense.platform} onChange={null} className="shrink-0 self-center" />
                        ) : null}
                        {expense.bank_name ? (
                          <div className="flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white/90 px-1.5 py-0.5 text-xs text-secondary shadow-2xs self-center">
                            <BankLogo bankName={expense.bank_name} size="xs" />
                            <span className="font-medium text-[10px] truncate max-w-[70px]">{expense.bank_name}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <strong className="text-lg font-bold text-ink shrink-0">{formatCurrency(expense.amount)}</strong>
                  </div>

                  <div className="space-y-0.5">
                    <strong className="block text-sm sm:text-base text-ink">{expense.description}</strong>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[color:var(--border)]/60">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                      <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary">{expense.category}</span>
                      <span>{expense.date}</span>
                    </div>

                    <ItemActionButtons
                      description={expense.description}
                      isDeleting={deletingExpenseIds.includes(expense.id)}
                      onEdit={() => handleEditStart(expense)}
                      onDelete={() => handleDeleteClick(expense)}
                    />
                  </div>
                </article>
              ))}
            </div>

            {totalExpensePages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border)] bg-white/75 px-3.5 py-2.5">
                <p className="text-xs text-secondary">Page {currentExpensesPage} of {totalExpensePages}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="ui-button-secondary text-xs px-2.5 py-1" disabled={currentExpensesPage === 1} onClick={() => onExpensesPageChange(currentExpensesPage - 1)}>
                    Previous
                  </button>
                  <button type="button" className="ui-button-secondary text-xs px-2.5 py-1" disabled={currentExpensesPage === totalExpensePages} onClick={() => onExpensesPageChange(currentExpensesPage + 1)}>
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </SurfaceCard>

      {isExpenseSheetOpen ? (
        <ModalFrame onClose={() => { if (editingExpenseId) { handleEditCancel(); } else { setIsExpenseSheetOpen(false); } }} className="max-w-[760px] overflow-y-auto p-5 sm:p-6">
          {renderExpenseForm(true)}
        </ModalFrame>
      ) : null}

      {deleteConfirmation ? (
        <ModalFrame onClose={() => setDeleteConfirmation(null)} className="max-w-[440px] p-6 text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-tint text-[color:var(--danger-text)] shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold text-ink">
                {deleteConfirmation.type === "single" ? "Delete expense?" : "Delete selected expenses?"}
              </h3>
              <p className="text-sm leading-6 text-secondary">
                {deleteConfirmation.type === "single" ? (
                  <>
                    Are you sure you want to permanently delete <strong className="text-ink">"{deleteConfirmation.description}"</strong> ({deleteConfirmation.amount})? This action cannot be undone.
                  </>
                ) : (
                  <>
                    Are you sure you want to permanently delete <strong className="text-ink">{deleteConfirmation.description}</strong>? This action cannot be undone.
                  </>
                )}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ui-button-secondary w-full justify-center sm:w-auto"
                onClick={() => setDeleteConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-button-danger w-full justify-center sm:w-auto"
                onClick={() => void handleConfirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}