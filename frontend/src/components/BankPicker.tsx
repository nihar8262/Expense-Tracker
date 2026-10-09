import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { BankAccount, BankAccountType } from "../types";
import {
  getBankDefinition,
  getAccountTypeLabel,
  getAccountTypeBadgeColor
} from "../lib/banks";
import { useAuth } from "../hooks/useAuth";
import { listBankAccounts } from "../services/api";

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function BankLogo({
  bankId,
  bankName,
  name,
  size,
  className
}: {
  bankId?: string | null;
  bankName?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | string;
  className?: string;
}) {
  const effectiveIdentifier = bankId || bankName || name;
  const bank = getBankDefinition(effectiveIdentifier);
  const [imgError, setImgError] = useState(false);

  const sizeClasses =
    size === "xs"
      ? "w-4 h-4 text-[8px]"
      : size === "sm"
      ? "w-5 h-5 text-[9px]"
      : size === "lg"
      ? "w-8 h-8 text-xs font-bold"
      : "w-6 h-6 text-[10px] font-semibold";

  const resolvedClass = className || sizeClasses;

  if (bank.logoPath && !imgError) {
    return (
      <div
        className={cn(
          "rounded-md overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 p-0.5 flex items-center justify-center shrink-0 shadow-2xs",
          resolvedClass
        )}
        title={bank.name}
      >
        <img
          src={bank.logoPath}
          alt={bank.name}
          className="w-full h-full object-contain rounded-xs"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${bank.primaryColor}, ${bank.secondaryColor})`,
        color: bank.textColor
      }}
      className={cn(
        "rounded-md flex items-center justify-center font-mono tracking-wider select-none shrink-0 shadow-2xs border border-white/20",
        resolvedClass
      )}
      title={bank.name}
    >
      {bank.shortName.slice(0, 3)}
    </div>
  );
}

export function BankCardBadge({
  accountType,
  type,
  className = ""
}: {
  accountType?: BankAccountType;
  type?: BankAccountType | string;
  className?: string;
}) {
  const actualType = (accountType || type || "debit") as BankAccountType;
  const colors = getAccountTypeBadgeColor(actualType);
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border
      }}
      className={cn(
        "inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-semibold tracking-wide uppercase border shrink-0",
        className
      )}
    >
      {getAccountTypeLabel(actualType)}
    </span>
  );
}

interface BankPickerProps {
  value?: string | null;
  selectedBankAccountId?: string | null;
  selectedBankName?: string | null;
  userAccounts?: BankAccount[];
  onChange: (bankAccountId: string | null, bankName: string | null, accountType?: BankAccountType | null) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function BankPicker({
  value,
  selectedBankAccountId,
  selectedBankName,
  userAccounts: passedAccounts,
  onChange,
  label = "Paid via Bank / Card",
  disabled = false,
  className = ""
}: BankPickerProps) {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedBankAccountId || value || null);
  const [fetchedAccounts, setFetchedAccounts] = useState<BankAccount[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedBankAccountId !== undefined) {
      setInternalSelectedId(selectedBankAccountId);
    } else if (value !== undefined) {
      setInternalSelectedId(value);
    }
  }, [selectedBankAccountId, value]);

  // If userAccounts is passed, use it; otherwise fetch user's linked accounts automatically
  useEffect(() => {
    let isMounted = true;
    if (passedAccounts && passedAccounts.length > 0) {
      setFetchedAccounts(passedAccounts);
    } else if (currentUser) {
      listBankAccounts(currentUser)
        .then((accounts) => {
          if (isMounted) setFetchedAccounts(accounts);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [passedAccounts, currentUser]);

  const accounts = (passedAccounts && passedAccounts.length > 0) ? passedAccounts : fetchedAccounts;
  const effectiveId = internalSelectedId ?? (selectedBankAccountId !== undefined ? selectedBankAccountId : value);

  // Find currently selected account:
  // If an ID is present, STRICTLY match by ID.
  // This guarantees debit and credit cards from the same bank never accidentally default to each other.
  const currentAccount = useMemo(() => {
    if (effectiveId) {
      const matchById = accounts.find((acc) => acc.id === effectiveId);
      if (matchById) return matchById;
    }
    if (selectedBankName && !effectiveId) {
      const matches = accounts.filter(
        (acc) => acc.bank_name.toLowerCase() === selectedBankName.toLowerCase()
      );
      if (matches.length === 1) return matches[0];
      return matches.find((acc) => acc.is_default) || matches[0];
    }
    return undefined;
  }, [accounts, effectiveId, selectedBankName]);

  // Position calculation for portal using fixed viewport coordinates
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Place above ONLY if space below is too tight (< 180px) AND space above is greater
    const showAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableHeight = showAbove ? Math.max(120, spaceAbove - 16) : Math.max(120, spaceBelow - 16);
    const maxHeight = Math.min(320, availableHeight);

    const width = Math.max(rect.width, 280);
    // Ensure dropdown stays horizontally inside viewport
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    setCoords({
      top: showAbove ? undefined : Math.round(rect.bottom + 6),
      bottom: showAbove ? Math.round(window.innerHeight - rect.top + 6) : undefined,
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight)
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleResize = () => updatePosition();
      const handleScroll = () => updatePosition();
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleScroll, true);
      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll, true);
      };
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Filter ONLY user's added accounts
  const query = search.trim().toLowerCase();
  const filteredAccounts = accounts.filter((acc) => {
    if (!query) return true;
    return (
      acc.bank_name.toLowerCase().includes(query) ||
      (acc.account_label && acc.account_label.toLowerCase().includes(query)) ||
      (acc.last_four_digits && acc.last_four_digits.includes(query)) ||
      acc.account_type.toLowerCase().includes(query)
    );
  });

  const handleSelectAccount = (acc: BankAccount) => {
    setInternalSelectedId(acc.id);
    onChange(acc.id, acc.bank_name, acc.account_type);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInternalSelectedId(null);
    onChange(null, null, null);
    setIsOpen(false);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
          <span>{label}</span>
          {(currentAccount || selectedBankName) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-zinc-400 hover:text-red-500 transition-colors font-medium"
            >
              Clear
            </button>
          )}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "relative w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left text-sm",
          "bg-white dark:bg-zinc-900 shadow-2xs",
          isOpen
            ? "border-sky-500 ring-2 ring-sky-500/20"
            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {currentAccount ? (
            <div className="flex items-center gap-2 min-w-0">
              <BankLogo bankId={currentAccount.bank_id} name={currentAccount.bank_name} size="sm" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate">
                    {currentAccount.account_label || currentAccount.bank_name}
                  </span>
                  {currentAccount.last_four_digits && (
                    <span className="text-[10px] text-zinc-400 font-mono">
                      ••{currentAccount.last_four_digits}
                    </span>
                  )}
                  <BankCardBadge accountType={currentAccount.account_type} />
                </div>
                {currentAccount.account_label && (
                  <span className="text-[10px] text-zinc-400 truncate mt-0.5">
                    {currentAccount.bank_name}
                  </span>
                )}
              </div>
            </div>
          ) : selectedBankName ? (
            <div className="flex items-center gap-2 min-w-0">
              <BankLogo name={selectedBankName} size="sm" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate">
                {selectedBankName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 text-xs">
              <span className="w-5 h-5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-[10px]">
                💳
              </span>
              <span>Select linked bank or card (Optional)</span>
            </div>
          )}
        </div>

        <svg
          className={cn("w-4 h-4 text-zinc-400 transition-transform shrink-0", isOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999
            }}
            className="flex flex-col rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Search header (only if more than 3 accounts) */}
            {accounts.length > 3 && (
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search linked banks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            )}

            {/* Scrollable list: ONLY user's added accounts */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 max-h-60">
              {accounts.length === 0 ? (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    No bank accounts or cards linked yet.
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Add your banks in your profile to tag them on expenses.
                  </p>
                  <Link
                    to="/profile"
                    onClick={() => setIsOpen(false)}
                    className="inline-block text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 pt-1"
                  >
                    + Add Bank in Profile →
                  </Link>
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="p-3 text-center text-xs text-zinc-400 italic">
                  No matching bank accounts found.
                </div>
              ) : (
                filteredAccounts.map((acc) => {
                  const isSelected = currentAccount?.id === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectAccount(acc);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-xl text-left transition-all",
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BankLogo bankId={acc.bank_id} name={acc.bank_name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold truncate">
                              {acc.account_label || acc.bank_name}
                            </span>
                            {acc.last_four_digits && (
                              <span className="text-[10px] font-mono text-zinc-400">
                                ••{acc.last_four_digits}
                              </span>
                            )}
                            <BankCardBadge accountType={acc.account_type} />
                          </div>
                          {acc.account_label && (
                            <span className="text-[10px] text-zinc-400 truncate block mt-0.5">
                              {acc.bank_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="text-sky-600 dark:text-sky-400 text-xs font-bold pl-2">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer with link to Profile */}
            <div className="p-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 flex items-center justify-between text-[11px]">
              <Link
                to="/profile"
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium"
              >
                Manage banks in Profile ↗
              </Link>
              {currentAccount && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-zinc-400 hover:text-red-500 transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
