import { useState, useEffect } from "react";
import type { User } from "firebase/auth";
import type { BankAccount, BankAccountForm, BankAccountType } from "../types";
import {
  SUPPORTED_BANKS,
  getBankDefinition,
  getAccountTypeLabel
} from "../lib/banks";
import { BankLogo } from "./BankPicker";
import { createBankAccount, updateBankAccount } from "../services/api";

interface AddBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onAccountSaved: (account: BankAccount) => void;
  editingAccount?: BankAccount | null;
}

export function AddBankAccountModal({
  isOpen,
  onClose,
  currentUser,
  onAccountSaved,
  editingAccount
}: AddBankAccountModalProps) {
  const isEditing = Boolean(editingAccount);

  const [selectedBankId, setSelectedBankId] = useState(editingAccount?.bank_id || "hdfc");
  const [accountType, setAccountType] = useState<BankAccountType>(editingAccount?.account_type || "debit");
  const [accountLabel, setAccountLabel] = useState(editingAccount?.account_label || "");
  const [lastFourDigits, setLastFourDigits] = useState(editingAccount?.last_four_digits || "");
  const [isDefault, setIsDefault] = useState(editingAccount?.is_default ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedBankId(editingAccount?.bank_id || "hdfc");
      setAccountType(editingAccount?.account_type || "debit");
      setAccountLabel(editingAccount?.account_label || "");
      setLastFourDigits(editingAccount?.last_four_digits || "");
      setIsDefault(editingAccount?.is_default ?? false);
      setError(null);
    }
  }, [isOpen, editingAccount]);

  if (!isOpen) return null;

  const selectedBank = getBankDefinition(selectedBankId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lastFourDigits && !/^\d{4}$/.test(lastFourDigits.trim())) {
      setError("Last 4 digits must contain exactly 4 numbers (or leave blank).");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (isEditing && editingAccount) {
        const updated = await updateBankAccount(
          editingAccount.id,
          {
            accountLabel: accountLabel.trim() || undefined,
            lastFourDigits: lastFourDigits.trim() || undefined,
            isDefault
          },
          currentUser
        );
        onAccountSaved(updated);
      } else {
        const payload: BankAccountForm = {
          bankId: selectedBank.id,
          bankName: selectedBank.name,
          accountType,
          accountLabel: accountLabel.trim() || undefined,
          lastFourDigits: lastFourDigits.trim() || undefined,
          isDefault
        };
        const created = await createBankAccount(payload, currentUser);
        onAccountSaved(created);
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save bank account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.5m-15 10.5V10.5M3 21h18M3 10.5h18" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isEditing ? "Edit Bank Account / Card" : "Add Bank Account or Card"}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isEditing ? "Update account nickname and digits" : "Link your bank for quick tagging in expenses"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* Bank display for editing mode */}
          {isEditing && editingAccount && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <BankLogo bankId={editingAccount.bank_id} name={editingAccount.bank_name} size="md" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block truncate">
                  {editingAccount.bank_name}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {getAccountTypeLabel(editingAccount.account_type)}
                </span>
              </div>
            </div>
          )}

          {/* Bank selection (only if adding new) */}
          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Select Bank
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/20">
                {SUPPORTED_BANKS.map((b) => {
                  const isSelected = selectedBankId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBankId(b.id)}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-700 dark:text-sky-300 font-semibold shadow-xs"
                          : "border-zinc-200/70 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <BankLogo bankId={b.id} size="sm" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold truncate leading-tight">{b.shortName}</span>
                        <span className="text-[10px] text-zinc-400 truncate leading-tight mt-0.5">{b.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Account / Card Type */}
          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Account / Card Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["debit", "credit", "rupay_credit"] as BankAccountType[]).map((type) => {
                  const isSelected = accountType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountType(type)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <span>{getAccountTypeLabel(type)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nickname / Custom Label */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Nickname / Card Label
              </label>
              <span className="text-[10px] text-zinc-400">Optional</span>
            </div>
            <input
              type="text"
              placeholder="e.g. Salary Account, Millennia CC, Regalia"
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Last 4 Digits */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Last 4 Digits
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Optional</span>
            </div>
            <input
              type="text"
              maxLength={4}
              placeholder="e.g. 4812 (for quick identification)"
              value={lastFourDigits}
              onChange={(e) => setLastFourDigits(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Default account toggle */}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-zinc-300"
            />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                Set as Default Payment Method
              </span>
              <span className="text-[11px] text-zinc-400 block">
                Automatically selected when adding new personal expenses
              </span>
            </div>
          </label>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shadow-sm transition-all"
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Link Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
