import { useState, useRef, useMemo, type FormEvent, type KeyboardEvent } from "react";
import type { CategoryOption, ExpenseForm } from "../types";
import { ModalFrame, SurfaceCard, StatusNotice, cn } from "./ui";
import { FilterDropdown } from "./FilterDropdown";
import { CategoryIcon } from "./CategoryIcon";
import { PlatformPicker } from "./PlatformPicker";
import { BankPicker } from "./BankPicker";
import { ReceiptScanPanel } from "./ReceiptScanPanel";
import { X } from "lucide-react";

type AddExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  form: ExpenseForm;
  onFormChange: (updater: (current: ExpenseForm) => ExpenseForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  currentUserPresent: boolean;
  currencySymbol?: string;
  availableCategoryOptions: CategoryOption[];
  onCategorySelect: (category: CategoryOption) => void;
  selectedCategoryOption?: CategoryOption | null;
  customCategoryName: string;
  onCustomCategoryNameChange: (val: string) => void;
  onCreateCustomCategory: () => void;
  editingExpenseId?: string | null;
  onEditCancel?: () => void;
  statusMessage?: string;
  errorMessage?: string;
};

function getTodayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayValue(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

export function AddExpenseModal({
  isOpen,
  onClose,
  form,
  onFormChange,
  onSubmit,
  isSubmitting,
  currentUserPresent,
  currencySymbol = "₹",
  availableCategoryOptions,
  onCategorySelect,
  selectedCategoryOption,
  customCategoryName,
  onCustomCategoryNameChange,
  onCreateCustomCategory,
  editingExpenseId,
  onEditCancel,
  statusMessage,
  errorMessage
}: AddExpenseModalProps) {
  const [showValidation, setShowValidation] = useState(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const isOtherCategorySelected = useMemo(
    () => selectedCategoryOption?.label.toLowerCase() === "other",
    [selectedCategoryOption]
  );

  const validationErrors = useMemo(() => {
    const errors = {
      amount: "",
      category: "",
      description: "",
      date: ""
    };

    if (!form.amount.trim()) {
      errors.amount = "Amount is required.";
    } else if (Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      errors.amount = "Amount must be a positive number.";
    }

    if (!form.category.trim()) {
      errors.category = "Category is required.";
    }

    if (!form.description.trim()) {
      errors.description = "Description is required.";
    }

    if (!form.date.trim()) {
      errors.date = "Date is required.";
    }

    return errors;
  }, [form.amount, form.category, form.description, form.date]);

  const hasValidationErrors = Object.values(validationErrors).some(Boolean);

  function handleScanComplete(data: {
    amount: string;
    description: string;
    date: string;
    category?: string;
    platform?: string;
  }) {
    onFormChange((current) => ({
      ...current,
      amount: data.amount,
      description: data.description,
      date: data.date,
      platform: data.platform || ""
    }));
    if (data.category) {
      const match = availableCategoryOptions.find(
        (opt) => opt.label.toLowerCase() === data.category!.toLowerCase()
      );
      if (match) {
        onCategorySelect(match);
      }
    }
  }

  function handleFieldAdvance(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    nextField: HTMLTextAreaElement | HTMLInputElement | null
  ) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    nextField?.focus();
  }

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
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <ModalFrame
      onClose={() => {
        if (editingExpenseId && onEditCancel) {
          onEditCancel();
        }
        onClose();
      }}
      className="max-w-[760px] max-h-[90vh] overflow-y-auto p-5 sm:p-6"
    >
      <div className="space-y-4">
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
          <button
            type="button"
            className="p-1 rounded-lg text-secondary hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            onClick={() => {
              if (editingExpenseId && onEditCancel) {
                onEditCancel();
              }
              onClose();
            }}
            title="Close form"
          >
            <X className="size-4" />
          </button>
        </div>

        {!editingExpenseId && (
          <ReceiptScanPanel onScanComplete={handleScanComplete} />
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
                  onChange={(event) =>
                    onFormChange((current) => ({ ...current, amount: event.target.value }))
                  }
                  onKeyDown={(event) => handleFieldAdvance(event, descriptionInputRef.current)}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 dark:text-zinc-100 z-10">
                  {currencySymbol}
                </span>
              </div>
              {showValidation && validationErrors.amount ? (
                <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.amount}</span>
              ) : null}
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
                  icon: <CategoryIcon iconId={category.icon} />
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
                <input
                  type="text"
                  className="h-[36px] text-xs"
                  placeholder="Write your category name"
                  disabled={!currentUserPresent}
                  value={customCategoryName}
                  onChange={(event) => onCustomCategoryNameChange(event.target.value)}
                />
                <button
                  type="button"
                  className="ui-button-secondary text-xs px-3 py-1.5"
                  onClick={onCreateCustomCategory}
                >
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
            {showValidation && validationErrors.description ? (
              <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.description}</span>
            ) : null}
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
              {showValidation && validationErrors.date ? (
                <span className="text-xs text-[color:var(--danger-text)]">{validationErrors.date}</span>
              ) : null}
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
              <button
                type="button"
                className="ui-button-secondary text-xs px-3.5 py-1.5"
                onClick={() => {
                  if (onEditCancel) onEditCancel();
                  onClose();
                }}
              >
                Cancel edit
              </button>
            ) : (
              <button
                type="button"
                className="ui-button-ghost text-xs px-3 py-1.5"
                onClick={onClose}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="ui-button-primary text-xs px-4 py-1.5 shadow-sm"
              disabled={isSubmitting || !currentUserPresent}
            >
              {isSubmitting
                ? editingExpenseId
                  ? "Updating..."
                  : "Saving..."
                : editingExpenseId
                  ? "Update expense"
                  : "Save expense"}
            </button>
          </div>

          {statusMessage ? <StatusNotice tone="success">{statusMessage}</StatusNotice> : null}
          {errorMessage ? <StatusNotice tone="error">{errorMessage}</StatusNotice> : null}
        </form>
      </div>
    </ModalFrame>
  );
}
