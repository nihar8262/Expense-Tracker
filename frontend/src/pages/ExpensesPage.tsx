import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CategoryIcon } from "../components/CategoryIcon";
import { EmptyState, ModalFrame, PageHero, SectionHeader, StatusNotice, SurfaceCard, cn } from "../components/ui";
import type { CategoryIconId, CategoryOption, Expense, ExpenseForm, TimeRangeFilter } from "../types";

type ExpensesPageProps = {
  currentUserPresent: boolean;
  authLoading: boolean;
  form: ExpenseForm;
  editingExpenseId: string | null;
  isSubmitting: boolean;
  statusMessage: string;
  errorMessage: string;
  customCategoryName: string;
  customCategoryIcon: CategoryIconId;
  selectedCategory: string;
  selectedTimeRange: TimeRangeFilter;
  sortNewestFirst: boolean;
  categories: string[];
  visibleExpenses: Expense[];
  totalVisibleExpenses: number;
  currentExpensesPage: number;
  totalExpensePages: number;
  expensesPageSize: number;
  availableCategoryOptions: CategoryOption[];
  selectedCategoryOption: CategoryOption | null;
  isOtherCategorySelected: boolean;
  iconOptions: Array<{ id: CategoryIconId; label: string }>;
  selectedExpenseIds: string[];
  selectedVisibleExpenseIds: string[];
  areAllVisibleExpensesSelected: boolean;
  deletingExpenseIds: string[];
  isLoading: boolean;
  formatCurrency: (amount: string) => string;
  resolveCategoryIcon: (categoryLabel: string, categoryOptions: CategoryOption[]) => CategoryIconId;
  onFormChange: (updater: (current: ExpenseForm) => ExpenseForm) => void;
  onCategorySelect: (category: CategoryOption) => void;
  onCustomCategoryNameChange: (value: string) => void;
  onCustomCategoryIconChange: (icon: CategoryIconId) => void;
  onCreateCustomCategory: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onEditCancel: () => void;
  onSelectedCategoryChange: (value: string) => void;
  onSortNewestFirstChange: (value: boolean) => void;
  onSelectedTimeRangeChange: (range: TimeRangeFilter) => void;
  onExpensesPageChange: (page: number) => void;
  onDeleteSelectedExpenses: () => Promise<void>;
  onToggleSelectAllVisibleExpenses: () => void;
  onToggleExpenseSelection: (expenseId: string) => void;
  onEditStart: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  onClearFilters: () => void;
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
  customCategoryIcon,
  selectedCategory,
  selectedTimeRange,
  sortNewestFirst,
  categories,
  visibleExpenses,
  totalVisibleExpenses,
  currentExpensesPage,
  totalExpensePages,
  expensesPageSize,
  availableCategoryOptions,
  selectedCategoryOption,
  isOtherCategorySelected,
  iconOptions,
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
  onCustomCategoryIconChange,
  onCreateCustomCategory,
  onSubmit,
  onEditCancel,
  onSelectedCategoryChange,
  onSortNewestFirstChange,
  onSelectedTimeRangeChange,
  onExpensesPageChange,
  onDeleteSelectedExpenses,
  onToggleSelectAllVisibleExpenses,
  onToggleExpenseSelection,
  onEditStart,
  onDeleteExpense,
  onClearFilters
}: ExpensesPageProps) {
  const [showValidation, setShowValidation] = useState(false);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const pageStart = totalVisibleExpenses === 0 ? 0 : (currentExpensesPage - 1) * expensesPageSize + 1;
  const pageEnd = totalVisibleExpenses === 0 ? 0 : Math.min(currentExpensesPage * expensesPageSize, totalVisibleExpenses);
  const validationErrors = useMemo(
    () => ({
      amount: form.amount.trim() ? "" : "Amount is required.",
      category: form.category.trim() ? "" : "Category is required.",
      description: form.description.trim() ? "" : "Description is required.",
      date: form.date.trim() ? "" : "Date is required."
    }),
    [form.amount, form.category, form.date, form.description]
  );
  const hasValidationErrors = Object.values(validationErrors).some(Boolean);
  const activeFilters = [selectedCategory ? `Category: ${selectedCategory}` : null, selectedTimeRange !== "all" ? `Range: ${selectedTimeRange}` : null, !sortNewestFirst ? "Sort: created order" : null].filter(Boolean) as string[];

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    setShowValidation(true);

    if (hasValidationErrors) {
      event.preventDefault();
      return;
    }

    await onSubmit(event);
    setIsExpenseSheetOpen(false);
  }

  function handleFieldAdvance(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, nextField: HTMLTextAreaElement | HTMLInputElement | null) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    nextField?.focus();
  }

  function renderExpenseForm(isSheet = false) {
    return (
      <SurfaceCard className={cn("space-y-5 p-5 sm:p-6", isSheet && "border-none bg-transparent p-0 shadow-none") }>
        <SectionHeader
          eyebrow="Capture"
          title={editingExpenseId ? "Edit expense" : "Add expense"}
          description={editingExpenseId ? "Update the selected expense and save the revised amount, category, description, or date." : "Capture a new expense with tactile category chips, quick dates, and clear validation."}
        />

        <form className="grid gap-4" onSubmit={(event) => void handleFormSubmit(event)} noValidate>
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Amount</span>
            <input
              type="number"
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
            {showValidation && validationErrors.amount ? <span className="text-sm text-[color:var(--danger-text)]">{validationErrors.amount}</span> : null}
          </label>

          <div className="grid gap-3">
            <span className="text-sm font-medium text-secondary required-mark">Category</span>
            <div className="flex items-center gap-3">
              {selectedCategoryOption ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-ink shadow-sm">
                  <CategoryIcon iconId={selectedCategoryOption.icon} />
                </span>
              ) : null}
              <select
                value={selectedCategoryOption?.label ?? ""}
                disabled={!currentUserPresent}
                onChange={(event) => {
                  const match = availableCategoryOptions.find((option) => option.label === event.target.value);
                  if (match) {
                    onCategorySelect(match);
                    requestAnimationFrame(() => descriptionInputRef.current?.focus());
                  }
                }}
                aria-invalid={showValidation && Boolean(validationErrors.category)}
              >
                <option value="">Select a category</option>
                {availableCategoryOptions.map((category) => (
                  <option key={category.id} value={category.label}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            {showValidation && validationErrors.category ? <span className="text-sm text-[color:var(--danger-text)]">{validationErrors.category}</span> : null}
          </div>

          {isOtherCategorySelected ? (
            <SurfaceCard className="space-y-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,243,232,0.8))] p-4 shadow-sm">
              <div>
                <strong className="text-base text-ink">Need another category?</strong>
                <p className="mt-1 text-sm leading-6 text-secondary">Write a category name and choose the icon you want to save with it.</p>
              </div>
              <label className="grid gap-2 text-sm font-medium text-secondary">
                Icon
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-ink shadow-sm">
                    <CategoryIcon iconId={customCategoryIcon} />
                  </span>
                  <select
                    value={customCategoryIcon}
                    onChange={(event) => onCustomCategoryIconChange(event.target.value as CategoryIconId)}
                  >
                    {iconOptions.map((iconOption) => (
                      <option key={iconOption.id} value={iconOption.id}>
                        {iconOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input type="text" placeholder="Write your category name" disabled={!currentUserPresent} value={customCategoryName} onChange={(event) => onCustomCategoryNameChange(event.target.value)} />
                <button type="button" className="ui-button-secondary" onClick={onCreateCustomCategory}>
                  Add category
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Description</span>
            <textarea
              ref={descriptionInputRef}
              required
              rows={3}
              disabled={!currentUserPresent}
              value={form.description}
              aria-invalid={showValidation && Boolean(validationErrors.description)}
              onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))}
              onKeyDown={(event) => handleFieldAdvance(event, dateInputRef.current)}
            />
            {showValidation && validationErrors.description ? <span className="text-sm text-[color:var(--danger-text)]">{validationErrors.description}</span> : null}
          </label>

          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Date</span>
            <input
              ref={dateInputRef}
              type="date"
              required
              disabled={!currentUserPresent}
              value={form.date}
              aria-invalid={showValidation && Boolean(validationErrors.date)}
              onChange={(event) => onFormChange((current) => ({ ...current, date: event.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-button-ghost" onClick={() => onFormChange((current) => ({ ...current, date: getTodayValue() }))}>
                Today
              </button>
              <button type="button" className="ui-button-ghost" onClick={() => onFormChange((current) => ({ ...current, date: getYesterdayValue() }))}>
                Yesterday
              </button>
            </div>
            {showValidation && validationErrors.date ? <span className="text-sm text-[color:var(--danger-text)]">{validationErrors.date}</span> : null}
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {editingExpenseId ? (
              <button type="button" className="ui-button-secondary" onClick={onEditCancel}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="ui-button-primary" disabled={isSubmitting || !currentUserPresent}>
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
    <>
      <PageHero
        eyebrow="Expenses"
        title="Capture, review, and refine each expense in one place."
        description="Move from quick entry to careful review without falling into a dense admin-table feel. On smaller screens, the list becomes stacked cards and the form moves into a sheet."
        actions={
          <button type="button" className="ui-button-primary lg:hidden" onClick={() => setIsExpenseSheetOpen(true)}>
            Add expense
          </button>
        }
      />

      <div className="hidden lg:block">{renderExpenseForm(false)}</div>

      <SurfaceCard className="space-y-5 p-5 sm:p-6">
        <SectionHeader title="Expense view" description="Filter by category, sort order, and time range without losing context." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            Category
            <select value={selectedCategory} disabled={!currentUserPresent} onChange={(event) => onSelectedCategoryChange(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-secondary">
            Sort
            <select value={sortNewestFirst ? "date_desc" : "none"} disabled={!currentUserPresent} onChange={(event) => onSortNewestFirstChange(event.target.value === "date_desc")}>
              <option value="date_desc">Newest first</option>
              <option value="none">Created order</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-secondary">
            Range
            <select value={selectedTimeRange} disabled={!currentUserPresent} onChange={(event) => onSelectedTimeRangeChange(event.target.value as TimeRangeFilter)}>
              <option value="all">All time</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 rounded-[22px] border border-[color:var(--border)] bg-white/75 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-secondary">{activeFilters.length > 0 ? `Showing: ${activeFilters.join(" • ")}` : "Showing: All categories • All time • Newest first"}</p>
          <button type="button" className="ui-button-ghost" disabled={activeFilters.length === 0} onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeader
            title="Your expenses"
            description={
              totalVisibleExpenses > 0
                ? `Showing ${pageStart}-${pageEnd} of ${totalVisibleExpenses} expenses tied to your authenticated account.`
                : "Only the expenses tied to your authenticated account are returned by the API."
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-secondary">{selectedVisibleExpenseIds.length > 0 ? `${selectedVisibleExpenseIds.length} selected` : "Select expenses to delete together"}</span>
            <button
              type="button"
              className="ui-button-danger"
              disabled={selectedVisibleExpenseIds.length === 0 || selectedVisibleExpenseIds.some((expenseId) => deletingExpenseIds.includes(expenseId))}
              onClick={() => void onDeleteSelectedExpenses()}
            >
              Delete selected
            </button>
          </div>
        </div>

        {!currentUserPresent && !authLoading ? <EmptyState title="Sign in to view expenses" description="Your private expense history only appears after authentication." /> : null}
        {currentUserPresent && isLoading ? <StatusNotice tone="neutral">Loading expenses...</StatusNotice> : null}
        {currentUserPresent && !isLoading && visibleExpenses.length === 0 ? <EmptyState title="No expenses match the current filters" description="Adjust the filters or add a new expense to bring this list back to life." /> : null}

        {currentUserPresent && !isLoading && visibleExpenses.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-[24px] border border-[color:var(--border)] lg:block">
              <table className="bg-white/80">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" aria-label={areAllVisibleExpensesSelected ? "Deselect all visible expenses" : "Select all visible expenses"} checked={areAllVisibleExpensesSelected} onChange={onToggleSelectAllVisibleExpenses} />
                    </th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenses.map((expense) => (
                    <tr key={expense.id} className="cursor-pointer hover:bg-white" onClick={() => onEditStart(expense)}>
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
                      <td className="text-secondary">{expense.date}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success-tint text-ink shadow-sm">
                            <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-secondary">{expense.category}</span>
                        </div>
                      </td>
                      <td>
                        <strong className="block text-ink">{expense.description}</strong>
                      </td>
                      <td className="text-right text-lg font-semibold text-ink">{formatCurrency(expense.amount)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="ui-button-ghost" onClick={(event) => { event.stopPropagation(); onEditStart(expense); }}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ui-button-danger"
                            disabled={deletingExpenseIds.includes(expense.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDeleteExpense(expense.id);
                            }}
                          >
                            {deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {visibleExpenses.map((expense) => (
                <article key={expense.id} className="table-card-mobile space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${expense.description}`}
                        checked={selectedExpenseIds.includes(expense.id)}
                        disabled={deletingExpenseIds.includes(expense.id)}
                        onChange={() => onToggleExpenseSelection(expense.id)}
                      />
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success-tint text-ink shadow-sm">
                        <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                      </span>
                    </div>
                    <strong className="text-xl text-ink">{formatCurrency(expense.amount)}</strong>
                  </div>

                  <div className="space-y-2">
                    <strong className="block text-lg text-ink">{expense.description}</strong>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                      <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-secondary">{expense.category}</span>
                      <span>{expense.date}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ui-button-secondary" onClick={() => onEditStart(expense)}>
                      Edit
                    </button>
                    <button type="button" className="ui-button-danger" disabled={deletingExpenseIds.includes(expense.id)} onClick={() => void onDeleteExpense(expense.id)}>
                      {deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {totalExpensePages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[color:var(--border)] bg-white/75 px-4 py-4">
                <p className="text-sm text-secondary">Page {currentExpensesPage} of {totalExpensePages}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ui-button-secondary" disabled={currentExpensesPage === 1} onClick={() => onExpensesPageChange(currentExpensesPage - 1)}>
                    Previous
                  </button>
                  <button type="button" className="ui-button-secondary" disabled={currentExpensesPage === totalExpensePages} onClick={() => onExpensesPageChange(currentExpensesPage + 1)}>
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </SurfaceCard>

      <button
        type="button"
        className="fixed bottom-28 right-4 z-20 inline-flex h-15 w-15 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-3xl text-white shadow-[0_24px_60px_rgba(30,122,83,0.28)] lg:hidden"
        onClick={() => setIsExpenseSheetOpen(true)}
        aria-label="Add expense"
      >
        +
      </button>

      {isExpenseSheetOpen ? (
        <ModalFrame onClose={() => setIsExpenseSheetOpen(false)} className="max-w-[760px] overflow-y-auto p-5 sm:p-6">
          {renderExpenseForm(true)}
        </ModalFrame>
      ) : null}
    </>
  );
}