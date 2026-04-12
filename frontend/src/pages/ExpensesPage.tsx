import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CategoryIcon } from "../components/CategoryIcon";
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
  }

  function handleFieldAdvance(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, nextField: HTMLTextAreaElement | HTMLInputElement | null) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    nextField?.focus();
  }

  return (
    <>
      <section className="hero-panel page-hero">
        <p className="eyebrow">Expenses</p>
        <h1>Capture, review, and refine each expense in one place.</h1>
        <p className="lede">This workspace is dedicated to adding new expenses, editing existing ones, and reviewing the filtered list without mixing it into the analytics view.</p>
      </section>

      <section className="content-grid expenses-page-grid">
        <form className="card form-card" onSubmit={(event) => void handleFormSubmit(event)} noValidate>
          <div className="section-heading">
            <h2>{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
            <p>{editingExpenseId ? "Update the selected expense and save the revised amount, category, description, or date." : "Each save is tied to your account, and retries remain idempotent per user."}</p>
          </div>

          <label>
            <span>Amount <sup className="required-marker">*</sup></span>
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
            {showValidation && validationErrors.amount ? <small className="field-error-message">{validationErrors.amount}</small> : null}
          </label>

          <label>
            <span>Category <sup className="required-marker">*</sup></span>
            <div className="category-field">
              <div className="category-selector-grid" role="list" aria-label="Expense categories">
                {availableCategoryOptions.map((category) => {
                  const isActive = selectedCategoryOption?.label.toLowerCase() === category.label.toLowerCase();

                  return (
                    <button key={category.id} type="button" className={isActive ? "category-chip is-active" : "category-chip"} aria-pressed={isActive} onClick={() => {
                      onCategorySelect(category);
                      requestAnimationFrame(() => descriptionInputRef.current?.focus());
                    }}>
                      <span className="category-chip-icon">
                        <CategoryIcon iconId={category.icon} />
                      </span>
                      <span>{category.label}</span>
                    </button>
                  );
                })}
              </div>

              {isOtherCategorySelected ? (
                <div className="custom-category-builder">
                  <div className="custom-category-copy">
                    <strong>Need another category?</strong>
                    <p>Write your category name and choose the icon you want to save with it.</p>
                  </div>

                  <div className="icon-picker-grid" role="list" aria-label="Category icons">
                    {iconOptions.map((iconOption) => (
                      <button key={iconOption.id} type="button" className={customCategoryIcon === iconOption.id ? "icon-picker-button is-active" : "icon-picker-button"} onClick={() => onCustomCategoryIconChange(iconOption.id)}>
                        <span className="category-chip-icon">
                          <CategoryIcon iconId={iconOption.id} />
                        </span>
                        <span>{iconOption.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="custom-category-row">
                    <input type="text" placeholder="Write your category name" disabled={!currentUserPresent} value={customCategoryName} onChange={(event) => onCustomCategoryNameChange(event.target.value)} />
                    <button type="button" className="secondary-button" onClick={onCreateCustomCategory}>
                      Add category
                    </button>
                  </div>
                </div>
              ) : null}

              <input type="hidden" required value={form.category} readOnly />
            </div>
            {showValidation && validationErrors.category ? <small className="field-error-message">{validationErrors.category}</small> : null}
          </label>

          <label>
            <span>Description <sup className="required-marker">*</sup></span>
            <textarea ref={descriptionInputRef} required rows={3} disabled={!currentUserPresent} value={form.description} aria-invalid={showValidation && Boolean(validationErrors.description)} onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))} onKeyDown={(event) => handleFieldAdvance(event, dateInputRef.current)} />
            {showValidation && validationErrors.description ? <small className="field-error-message">{validationErrors.description}</small> : null}
          </label>

          <label>
            <span>Date <sup className="required-marker">*</sup></span>
            <input ref={dateInputRef} type="date" required disabled={!currentUserPresent} value={form.date} aria-invalid={showValidation && Boolean(validationErrors.date)} onChange={(event) => onFormChange((current) => ({ ...current, date: event.target.value }))} />
            <div className="date-shortcuts">
              <button type="button" className="table-action-button" onClick={() => onFormChange((current) => ({ ...current, date: new Date().toISOString().slice(0, 10) }))}>
                Today
              </button>
              <button
                type="button"
                className="table-action-button"
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  onFormChange((current) => ({ ...current, date: yesterday.toISOString().slice(0, 10) }));
                }}
              >
                Yesterday
              </button>
            </div>
            {showValidation && validationErrors.date ? <small className="field-error-message">{validationErrors.date}</small> : null}
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-action-button" disabled={isSubmitting || !currentUserPresent}>
              {isSubmitting ? (editingExpenseId ? "Updating..." : "Saving...") : editingExpenseId ? "Update expense" : "Save expense"}
            </button>

            {editingExpenseId ? (
              <button type="button" className="ghost-button subtle-button" onClick={onEditCancel}>
                Cancel edit
              </button>
            ) : null}
          </div>

          {statusMessage ? <p className="status-message success">{statusMessage}</p> : null}
          {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
        </form>

        <section className="card filter-card expenses-filter-card">
          <div className="section-heading">
            <h2>Expense view</h2>
            <p>These filters apply only to your expense list below.</p>
          </div>

          <div className="filter-grid filter-grid-wide">
            <label>
              <span>Category</span>
              <select value={selectedCategory} disabled={!currentUserPresent} onChange={(event) => onSelectedCategoryChange(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Sort</span>
              <select value={sortNewestFirst ? "date_desc" : "none"} disabled={!currentUserPresent} onChange={(event) => onSortNewestFirstChange(event.target.value === "date_desc")}>
                <option value="date_desc">Newest first</option>
                <option value="none">Created order</option>
              </select>
            </label>

            <label>
              <span>Range</span>
              <select value={selectedTimeRange} disabled={!currentUserPresent} onChange={(event) => onSelectedTimeRangeChange(event.target.value as TimeRangeFilter)}>
                <option value="all">All time</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
              </select>
            </label>
          </div>

          <div className="filter-feedback-row">
            <p className="filter-feedback-copy">{activeFilters.length > 0 ? `Showing: ${activeFilters.join(" | ")}` : "Showing: All categories | All time | Newest first"}</p>
            <button type="button" className="ghost-button filter-clear-button" disabled={activeFilters.length === 0} onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        </section>

        <section className="card list-card">
          <div className="list-card-heading">
            <div className="section-heading">
              <h2>Your expenses</h2>
              <p>
                {totalVisibleExpenses > 0
                  ? `Showing ${pageStart}-${pageEnd} of ${totalVisibleExpenses} expenses tied to your authenticated account.`
                  : "Only the expenses tied to your authenticated account are returned by the API."}
              </p>
            </div>

            <div className="list-card-tools">
              <span className="list-selection-copy">{selectedVisibleExpenseIds.length > 0 ? `${selectedVisibleExpenseIds.length} selected` : "Select expenses to delete together"}</span>
              <button
                type="button"
                className="table-action-button bulk-delete-button danger-button"
                disabled={selectedVisibleExpenseIds.length === 0 || selectedVisibleExpenseIds.some((expenseId) => deletingExpenseIds.includes(expenseId))}
                onClick={() => void onDeleteSelectedExpenses()}
              >
                Delete selected
              </button>
            </div>
          </div>

          {!currentUserPresent && !authLoading ? <p className="empty-state">Sign in to view your private expense history.</p> : null}
          {currentUserPresent && isLoading ? <p className="empty-state">Loading expenses...</p> : null}
          {currentUserPresent && !isLoading && visibleExpenses.length === 0 ? <p className="empty-state">No expenses match the current filters.</p> : null}

          {currentUserPresent && !isLoading && visibleExpenses.length > 0 ? (
            <>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input type="checkbox" aria-label={areAllVisibleExpensesSelected ? "Deselect all visible expenses" : "Select all visible expenses"} checked={areAllVisibleExpensesSelected} onChange={onToggleSelectAllVisibleExpenses} />
                      </th>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExpenses.map((expense) => (
                      <tr key={expense.id} className="expense-row" onClick={() => onEditStart(expense)}>
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
                        <td>{expense.date}</td>
                        <td>
                          <div className="expense-category-cell expense-category-badge">
                            <span className="expense-category-icon">
                              <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                            </span>
                            <span>{expense.category}</span>
                          </div>
                        </td>
                        <td>{expense.description}</td>
                        <td className="expense-amount-cell">{formatCurrency(expense.amount)}</td>
                        <td>
                          <div className="table-actions">
                            <button type="button" className="table-action-button" onClick={(event) => {
                              event.stopPropagation();
                              onEditStart(expense);
                            }}>
                              Edit
                            </button>
                            <button type="button" className="table-action-button danger-button" disabled={deletingExpenseIds.includes(expense.id)} onClick={(event) => {
                              event.stopPropagation();
                              void onDeleteExpense(expense.id);
                            }}>
                              {deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalExpensePages > 1 ? (
                <div className="pagination-bar" aria-label="Expenses pagination">
                  <p className="pagination-copy">Page {currentExpensesPage} of {totalExpensePages}</p>
                  <div className="pagination-actions">
                    <button type="button" className="table-action-button" disabled={currentExpensesPage === 1} onClick={() => onExpensesPageChange(currentExpensesPage - 1)}>
                      Previous
                    </button>
                    <button type="button" className="table-action-button" disabled={currentExpensesPage === totalExpensePages} onClick={() => onExpensesPageChange(currentExpensesPage + 1)}>
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </>
  );
}
