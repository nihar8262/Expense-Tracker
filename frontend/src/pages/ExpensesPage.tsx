import type { FormEvent } from "react";
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
  onDeleteSelectedExpenses: () => Promise<void>;
  onToggleSelectAllVisibleExpenses: () => void;
  onToggleExpenseSelection: (expenseId: string) => void;
  onEditStart: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
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
  onDeleteSelectedExpenses,
  onToggleSelectAllVisibleExpenses,
  onToggleExpenseSelection,
  onEditStart,
  onDeleteExpense
}: ExpensesPageProps) {
  return (
    <>
      <section className="hero-panel page-hero">
        <p className="eyebrow">Expenses</p>
        <h1>Capture, review, and refine each expense in one place.</h1>
        <p className="lede">This workspace is dedicated to adding new expenses, editing existing ones, and reviewing the filtered list without mixing it into the analytics view.</p>
      </section>

      <section className="content-grid expenses-page-grid">
        <form className="card form-card" onSubmit={(event) => void onSubmit(event)}>
          <div className="section-heading">
            <h2>{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
            <p>{editingExpenseId ? "Update the selected expense and save the revised amount, category, description, or date." : "Each save is tied to your account, and retries remain idempotent per user."}</p>
          </div>

          <label>
            <span>Amount</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              disabled={!currentUserPresent}
              value={form.amount}
              onChange={(event) => onFormChange((current) => ({ ...current, amount: event.target.value }))}
            />
          </label>

          <label>
            <span>Category</span>
            <div className="category-field">
              <div className="category-selector-grid" role="list" aria-label="Expense categories">
                {availableCategoryOptions.map((category) => {
                  const isActive = selectedCategoryOption?.label.toLowerCase() === category.label.toLowerCase();

                  return (
                    <button key={category.id} type="button" className={isActive ? "category-chip is-active" : "category-chip"} onClick={() => onCategorySelect(category)}>
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
          </label>

          <label>
            <span>Description</span>
            <textarea required rows={3} disabled={!currentUserPresent} value={form.description} onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))} />
          </label>

          <label>
            <span>Date</span>
            <input type="date" required disabled={!currentUserPresent} value={form.date} onChange={(event) => onFormChange((current) => ({ ...current, date: event.target.value }))} />
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
        </section>

        <section className="card list-card">
          <div className="list-card-heading">
            <div className="section-heading">
              <h2>Your expenses</h2>
              <p>Only the expenses tied to your authenticated account are returned by the API.</p>
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
                    <tr key={expense.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${expense.description}`}
                          checked={selectedExpenseIds.includes(expense.id)}
                          disabled={deletingExpenseIds.includes(expense.id)}
                          onChange={() => onToggleExpenseSelection(expense.id)}
                        />
                      </td>
                      <td>{expense.date}</td>
                      <td>
                        <div className="expense-category-cell">
                          <span className="expense-category-icon">
                            <CategoryIcon iconId={resolveCategoryIcon(expense.category, availableCategoryOptions)} />
                          </span>
                          <span>{expense.category}</span>
                        </div>
                      </td>
                      <td>{expense.description}</td>
                      <td>{formatCurrency(expense.amount)}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="table-action-button" onClick={() => onEditStart(expense)}>
                            Edit
                          </button>
                          <button type="button" className="table-action-button danger-button" disabled={deletingExpenseIds.includes(expense.id)} onClick={() => void onDeleteExpense(expense.id)}>
                            {deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </>
  );
}
