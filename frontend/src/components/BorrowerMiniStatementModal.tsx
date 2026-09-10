import { useMemo, useState, useEffect } from "react";
import { ModalFrame, cn } from "./ui";
import type { WalletLoan } from "../types";

export interface BorrowerMiniStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: WalletLoan[];
  initialBorrowerKey?: string | null;
  formatCurrency: (amount: string, currency?: string) => string;
  currencySymbol?: string;
  walletMembers?: Array<{ id: string; display_name: string; email?: string | null }>;
  onOpenRepayment?: (loan: WalletLoan) => void;
}

interface BorrowerOption {
  key: string;
  name: string;
  email: string | null;
  loans: WalletLoan[];
  totalLent: number;
  remainingBalance: number;
  hasOverdue: boolean;
}

interface MonthlyStatementRow {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "September 2026"
  borrowedAmount: number;
  repaidAmount: number;
  netChange: number;
  loansCount: number;
  repaymentsCount: number;
  isOverdue: boolean;
  status: "settled" | "active" | "overdue" | "repayment_only";
}

interface StatementLedgerEvent {
  id: string;
  date: string;
  type: "disbursement" | "repayment";
  amount: number;
  notes: string | null;
  loanId: string;
  loanPrincipal?: number;
  interestInfo?: string;
  dueDate?: string | null;
  isOverdue?: boolean;
}

function getMemberAvatarUrl(displayName: string, email?: string | null) {
  const hashStr = displayName || email || "User";
  let hash = 0;
  for (let i = 0; i < hashStr.length; i++) {
    hash = hashStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    { bg: "e8f5e9", text: "1b5e20" },
    { bg: "e3f2fd", text: "0d47a1" },
    { bg: "f3e5f5", text: "4a148c" },
    { bg: "fff3e0", text: "e65100" },
    { bg: "ffebee", text: "b71c1c" },
    { bg: "f1f8e9", text: "33691e" },
    { bg: "e0f7fa", text: "006064" },
  ];
  const color = colors[Math.abs(hash) % colors.length]!;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=${color.bg}&color=${color.text}&bold=true&size=128`;
}

export function calculateLoanFinancials(loan: WalletLoan) {
  const principal = parseFloat(loan.amount) || 0;
  const totalRepaid = loan.repayments?.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0) || 0;
  const rate = Number(loan.interest_rate) || 0;

  let accruedInterest = 0;
  if (rate > 0) {
    if (loan.interest_type === "fixed") {
      accruedInterest = rate;
    } else {
      const startStr = loan.interest_start_date || loan.lending_date;
      const startDate = new Date(startStr);
      const now = new Date();

      if (now >= startDate) {
        if (loan.interest_rate_period === "one-time") {
          accruedInterest = (principal * rate) / 100;
        } else if (loan.interest_rate_period === "yearly") {
          const diffMonths = Math.max(1, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()) + 1);
          const diffYears = diffMonths / 12;
          accruedInterest = (principal * (rate / 100)) * diffYears;
        } else {
          // monthly
          const months = Math.max(1, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()) + 1);
          accruedInterest = (principal * (rate / 100)) * months;
        }
      }
    }
  }

  const totalDue = principal + accruedInterest;
  const remainingBalance = Math.max(0, totalDue - totalRepaid);
  const isFullyPaid = totalRepaid >= totalDue && totalDue > 0;
  const progressPercent = totalDue > 0 ? Math.min(100, Math.round((totalRepaid / totalDue) * 100)) : 100;
  const isOverdue = Boolean(loan.due_date && new Date(loan.due_date) < new Date() && remainingBalance > 0);

  return {
    principal,
    accruedInterest,
    totalDue,
    totalRepaid,
    remainingBalance,
    isFullyPaid,
    progressPercent,
    isOverdue
  };
}

export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}

export function BorrowerMiniStatementModal({
  isOpen,
  onClose,
  loans,
  initialBorrowerKey,
  formatCurrency,
  currencySymbol = "₹",
  walletMembers = [],
  onOpenRepayment
}: BorrowerMiniStatementModalProps) {
  // 1. Group loans by borrower
  const borrowerOptions = useMemo<BorrowerOption[]>(() => {
    const map = new Map<string, { key: string; name: string; email: string | null; loans: WalletLoan[] }>();

    for (const loan of loans) {
      let bName = loan.borrower_name || loan.borrower_member_name;
      let bEmail = loan.borrower_email;

      if (loan.borrower_member_id && walletMembers.length > 0) {
        const mem = walletMembers.find((m) => m.id === loan.borrower_member_id);
        if (mem) {
          bName = mem.display_name;
          if (mem.email) bEmail = mem.email;
        }
      }

      const finalName = bName ? bName.trim() : "Unknown Borrower";
      const key = loan.borrower_member_id
        ? `member:${loan.borrower_member_id}`
        : `name:${finalName.toLowerCase()}`;

      const existing = map.get(key);
      if (existing) {
        existing.loans.push(loan);
        if (!existing.email && bEmail) existing.email = bEmail;
      } else {
        map.set(key, {
          key,
          name: finalName,
          email: bEmail || null,
          loans: [loan]
        });
      }
    }

    const options: BorrowerOption[] = [];
    for (const item of map.values()) {
      let totalLent = 0;
      let remainingBalance = 0;
      let hasOverdue = false;

      for (const l of item.loans) {
        const fin = calculateLoanFinancials(l);
        totalLent += fin.principal;
        remainingBalance += fin.remainingBalance;
        if (fin.isOverdue) hasOverdue = true;
      }

      options.push({
        ...item,
        totalLent,
        remainingBalance,
        hasOverdue
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [loans, walletMembers]);

  // 2. Currently selected borrower key
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "disbursements" | "repayments">("all");
  const [activeTab, setActiveTab] = useState<"monthly" | "ledger" | "loans">("monthly");

  // Sync selected borrower when modal opens or initialBorrowerKey changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialBorrowerKey && borrowerOptions.some((b) => b.key === initialBorrowerKey)) {
      setSelectedKey(initialBorrowerKey);
    } else if (borrowerOptions.length > 0) {
      if (!selectedKey || !borrowerOptions.some((b) => b.key === selectedKey)) {
        setSelectedKey(borrowerOptions[0]?.key || "");
      }
    } else {
      setSelectedKey("");
    }
  }, [isOpen, initialBorrowerKey, borrowerOptions]);

  const currentBorrower = useMemo(() => {
    return borrowerOptions.find((b) => b.key === selectedKey) || borrowerOptions[0] || null;
  }, [borrowerOptions, selectedKey]);

  // 3. Consolidated calculations for current borrower
  const borrowerFinancials = useMemo(() => {
    if (!currentBorrower) {
      return {
        totalPrincipal: 0,
        totalAccruedInterest: 0,
        totalDue: 0,
        totalRepaid: 0,
        outstandingBalance: 0,
        activeLoansCount: 0,
        repaidLoansCount: 0,
        overdueLoansCount: 0,
        dueCount: 0,
        earliestDate: null as string | null,
        latestDate: null as string | null
      };
    }

    let totalPrincipal = 0;
    let totalAccruedInterest = 0;
    let totalDue = 0;
    let totalRepaid = 0;
    let outstandingBalance = 0;
    let activeLoansCount = 0;
    let repaidLoansCount = 0;
    let overdueLoansCount = 0;
    let dueCount = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const loan of currentBorrower.loans) {
      const fin = calculateLoanFinancials(loan);
      totalPrincipal += fin.principal;
      totalAccruedInterest += fin.accruedInterest;
      totalDue += fin.totalDue;
      totalRepaid += fin.totalRepaid;
      outstandingBalance += fin.remainingBalance;

      if (fin.isFullyPaid) {
        repaidLoansCount++;
      } else {
        activeLoansCount++;
      }

      if (fin.isOverdue) {
        overdueLoansCount++;
      }

      if (loan.due_date) {
        dueCount++;
      }

      if (!earliestDate || loan.lending_date < earliestDate) {
        earliestDate = loan.lending_date;
      }
      if (!latestDate || loan.lending_date > latestDate) {
        latestDate = loan.lending_date;
      }
    }

    return {
      totalPrincipal,
      totalAccruedInterest,
      totalDue,
      totalRepaid,
      outstandingBalance,
      activeLoansCount,
      repaidLoansCount,
      overdueLoansCount,
      dueCount,
      earliestDate,
      latestDate
    };
  }, [currentBorrower]);

  // 4. Month-by-month breakdown
  const monthlyBreakdown = useMemo<MonthlyStatementRow[]>(() => {
    if (!currentBorrower) return [];

    const monthMap = new Map<string, {
      borrowedAmount: number;
      repaidAmount: number;
      loansCount: number;
      repaymentsCount: number;
      hasOverdue: boolean;
      hasActive: boolean;
    }>();

    for (const loan of currentBorrower.loans) {
      const mKey = loan.lending_date ? loan.lending_date.slice(0, 7) : "Unknown";
      const fin = calculateLoanFinancials(loan);

      const m = monthMap.get(mKey) || {
        borrowedAmount: 0,
        repaidAmount: 0,
        loansCount: 0,
        repaymentsCount: 0,
        hasOverdue: false,
        hasActive: false
      };

      m.borrowedAmount += fin.principal;
      m.loansCount += 1;
      if (fin.isOverdue) m.hasOverdue = true;
      if (!fin.isFullyPaid) m.hasActive = true;

      monthMap.set(mKey, m);

      // Add repayments to their respective repayment months
      if (loan.repayments && loan.repayments.length > 0) {
        for (const rep of loan.repayments) {
          const repMKey = rep.repayment_date ? rep.repayment_date.slice(0, 7) : mKey;
          const repM = monthMap.get(repMKey) || {
            borrowedAmount: 0,
            repaidAmount: 0,
            loansCount: 0,
            repaymentsCount: 0,
            hasOverdue: false,
            hasActive: false
          };
          repM.repaidAmount += (parseFloat(rep.amount) || 0);
          repM.repaymentsCount += 1;
          monthMap.set(repMKey, repM);
        }
      }
    }

    const rows: MonthlyStatementRow[] = [];
    for (const [mKey, data] of monthMap.entries()) {
      let status: MonthlyStatementRow["status"] = "settled";
      if (data.hasOverdue) {
        status = "overdue";
      } else if (data.hasActive || data.borrowedAmount > data.repaidAmount) {
        status = "active";
      } else if (data.borrowedAmount === 0 && data.repaidAmount > 0) {
        status = "repayment_only";
      }

      rows.push({
        monthKey: mKey,
        monthLabel: formatMonthKey(mKey),
        borrowedAmount: data.borrowedAmount,
        repaidAmount: data.repaidAmount,
        netChange: data.borrowedAmount - data.repaidAmount,
        loansCount: data.loansCount,
        repaymentsCount: data.repaymentsCount,
        isOverdue: data.hasOverdue,
        status
      });
    }

    // Sort descending by month
    return rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [currentBorrower]);

  // 5. Unified Chronological Activity Ledger
  const ledgerEvents = useMemo<StatementLedgerEvent[]>(() => {
    if (!currentBorrower) return [];

    const events: StatementLedgerEvent[] = [];

    for (const loan of currentBorrower.loans) {
      const fin = calculateLoanFinancials(loan);
      const interestLabel = Number(loan.interest_rate) > 0
        ? `${loan.interest_type === "percentage" ? `${loan.interest_rate}% ${loan.interest_rate_period}` : `${currencySymbol}${loan.interest_rate} fixed`}`
        : undefined;

      events.push({
        id: `loan-${loan.id}`,
        date: loan.lending_date,
        type: "disbursement",
        amount: fin.principal,
        notes: loan.notes,
        loanId: loan.id,
        loanPrincipal: fin.principal,
        interestInfo: interestLabel,
        dueDate: loan.due_date,
        isOverdue: fin.isOverdue
      });

      if (loan.repayments) {
        for (const rep of loan.repayments) {
          events.push({
            id: `rep-${rep.id}`,
            date: rep.repayment_date,
            type: "repayment",
            amount: parseFloat(rep.amount) || 0,
            notes: rep.notes,
            loanId: loan.id
          });
        }
      }
    }

    // Filter by type if requested
    const filtered = events.filter((e) => {
      if (ledgerFilter === "disbursements") return e.type === "disbursement";
      if (ledgerFilter === "repayments") return e.type === "repayment";
      return true;
    });

    // Sort newest first
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [currentBorrower, ledgerFilter, currencySymbol]);

  if (!isOpen) return null;

  return (
    <ModalFrame onClose={onClose} className="flex max-h-[92vh] max-w-4xl flex-col p-0 overflow-hidden shadow-2xl">
      {/* Modal Header */}
      <div className="border-b border-[color:var(--border)] bg-zinc-50/80 dark:bg-zinc-900/90 px-5 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 text-lg shadow-sm border border-emerald-200/50 dark:border-emerald-800/40">
              📄
            </span>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">
                Borrower Mini Statement
              </h2>
              <p className="text-xs text-secondary">
                Consolidated ledger, monthly borrowings, repayments, and dues for this person
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Print Button */}
            <button
              type="button"
              onClick={() => window.print()}
              title="Print / Save Statement as PDF"
              className="ui-button-secondary !py-1.5 !px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.5A1.75 1.75 0 0 1 13.25 8H6.75A1.75 1.75 0 0 1 5 6.25v-3.5Zm1.5 0v3.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25ZM3.75 9h12.5c.966 0 1.75.784 1.75 1.75v4.5A1.75 1.75 0 0 1 16.25 17h-.75v1.25a1.75 1.75 0 0 1-1.75 1.75h-7.5A1.75 1.75 0 0 1 4.5 18.25V17h-.75A1.75 1.75 0 0 1 2 15.25v-4.5C2 9.784 2.784 9 3.75 9Zm1.5 8h9.5a.25.25 0 0 0 .25-.25V14H5v2.75c0 .138.112.25.25.25Z" clipRule="evenodd" />
              </svg>
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              className="ui-button-secondary !py-1.5 !px-3 text-xs cursor-pointer"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Borrower Selector & Profile Strip */}
        {borrowerOptions.length > 0 ? (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white dark:bg-zinc-800/80 rounded-2xl border border-[color:var(--border)] shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              {currentBorrower && (
                <img
                  src={getMemberAvatarUrl(currentBorrower.name, currentBorrower.email)}
                  alt={currentBorrower.name}
                  className="h-11 w-11 shrink-0 rounded-2xl border border-[color:var(--border)] object-cover shadow-xs"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary font-medium">Select Borrower:</span>
                  <select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    className="text-sm font-bold text-ink bg-zinc-100 dark:bg-zinc-700/60 rounded-xl px-2.5 py-1 border border-[color:var(--border)] focus:ring-2 focus:ring-primary/40 outline-hidden cursor-pointer"
                  >
                    {borrowerOptions.map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.name} ({b.loans.length} loan{b.loans.length !== 1 ? "s" : ""}) {b.hasOverdue ? "⚠️ Overdue" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {currentBorrower?.email && (
                  <p className="text-xs text-secondary truncate mt-0.5 ml-1">
                    {currentBorrower.email}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Badges */}
            {currentBorrower && (
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-700/60 text-secondary border border-[color:var(--border)]">
                  {currentBorrower.loans.length} Total Loans
                </span>
                {borrowerFinancials.overdueLoansCount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-900/50 animate-pulse flex items-center gap-1">
                    ⚠️ {borrowerFinancials.overdueLoansCount} Overdue
                  </span>
                ) : borrowerFinancials.outstandingBalance === 0 ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                    ✓ All Clear
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                    {borrowerFinancials.activeLoansCount} Active
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-secondary">
            No borrowers found in current loans list.
          </div>
        )}
      </div>

      {/* Modal Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
        {!currentBorrower ? (
          <div className="py-12 text-center text-secondary text-sm">
            Please select or add a loan to generate a statement.
          </div>
        ) : (
          <>
            {/* Top Consolidated Metrics Cards */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {/* Total Principal Lent */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Total Lent
                </span>
                <strong className="block text-xl font-extrabold text-ink truncate">
                  {formatCurrency(borrowerFinancials.totalPrincipal.toFixed(2))}
                </strong>
                <span className="text-[11px] text-secondary">
                  Across all months
                </span>
              </div>

              {/* Total Accrued Interest */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-purple-50/40 dark:bg-purple-950/20 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  Total Interest
                </span>
                <strong className="block text-xl font-extrabold text-purple-700 dark:text-purple-300 truncate">
                  +{formatCurrency(borrowerFinancials.totalAccruedInterest.toFixed(2))}
                </strong>
                <span className="text-[11px] text-secondary">
                  Accrued interest
                </span>
              </div>

              {/* Total Repaid */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Total Repaid
                </span>
                <strong className="block text-xl font-extrabold text-emerald-700 dark:text-emerald-300 truncate">
                  {formatCurrency(borrowerFinancials.totalRepaid.toFixed(2))}
                </strong>
                <span className="text-[11px] text-secondary">
                  {borrowerFinancials.repaidLoansCount} loans cleared
                </span>
              </div>

              {/* Current Outstanding Balance */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-amber-50/40 dark:bg-amber-950/20 p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Outstanding
                </span>
                <strong className={cn("block text-xl font-extrabold truncate", borrowerFinancials.outstandingBalance > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                  {formatCurrency(borrowerFinancials.outstandingBalance.toFixed(2))}
                </strong>
                <span className="text-[11px] text-secondary">
                  Remaining balance
                </span>
              </div>

              {/* Overdue / Dued Times */}
              <div className={cn(
                "rounded-2xl border p-3.5 space-y-1 col-span-2 sm:col-span-1",
                borrowerFinancials.overdueLoansCount > 0
                  ? "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/30"
                  : "border-[color:var(--border)] bg-zinc-50 dark:bg-zinc-800/40"
              )}>
                <span className={cn("text-[11px] font-bold uppercase tracking-wider", borrowerFinancials.overdueLoansCount > 0 ? "text-red-700 dark:text-red-300" : "text-secondary")}>
                  Times Dued
                </span>
                <div className="flex items-baseline gap-1.5">
                  <strong className={cn("text-xl font-extrabold", borrowerFinancials.overdueLoansCount > 0 ? "text-red-700 dark:text-red-300" : "text-ink")}>
                    {borrowerFinancials.overdueLoansCount}
                  </strong>
                  <span className="text-xs text-secondary font-medium">
                    overdue
                  </span>
                </div>
                <span className="text-[11px] text-secondary block truncate">
                  {borrowerFinancials.dueCount} loans with due dates
                </span>
              </div>
            </div>

            {/* Navigation Tabs (Monthly Breakdown vs Full Ledger vs Loans List) */}
            <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("monthly")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                    activeTab === "monthly"
                      ? "bg-primary text-white shadow-xs"
                      : "text-secondary hover:text-ink bg-zinc-100 dark:bg-zinc-800"
                  )}
                >
                  📅 Monthly Breakdown ({monthlyBreakdown.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ledger")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                    activeTab === "ledger"
                      ? "bg-primary text-white shadow-xs"
                      : "text-secondary hover:text-ink bg-zinc-100 dark:bg-zinc-800"
                  )}
                >
                  📜 Transaction Ledger ({ledgerEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("loans")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                    activeTab === "loans"
                      ? "bg-primary text-white shadow-xs"
                      : "text-secondary hover:text-ink bg-zinc-100 dark:bg-zinc-800"
                  )}
                >
                  💼 All Loans ({currentBorrower.loans.length})
                </button>
              </div>
            </div>

            {/* TAB 1: MONTH-BY-MONTH BREAKDOWN TABLE */}
            {activeTab === "monthly" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">
                    Month-by-Month Borrowing &amp; Repayment History
                  </h3>
                  <span className="text-xs text-secondary">
                    Aggregated by calendar month
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-white dark:bg-zinc-900 shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[color:var(--border)] bg-zinc-50 dark:bg-zinc-800/60 text-secondary font-semibold">
                        <th className="py-3 px-4">Month</th>
                        <th className="py-3 px-4 text-right">Borrowed Amount</th>
                        <th className="py-3 px-4 text-right">Repaid Amount</th>
                        <th className="py-3 px-4 text-right">Net Movement</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--border)]">
                      {monthlyBreakdown.map((row) => (
                        <tr key={row.monthKey} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-ink">
                            <div className="flex items-center gap-2">
                              <span>{row.monthLabel}</span>
                              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-secondary">
                                {row.loansCount} borrow{row.loansCount !== 1 ? "s" : ""}, {row.repaymentsCount} repay{row.repaymentsCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-ink">
                            {row.borrowedAmount > 0 ? (
                              formatCurrency(row.borrowedAmount.toFixed(2))
                            ) : (
                              <span className="text-secondary font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {row.repaidAmount > 0 ? (
                              formatCurrency(row.repaidAmount.toFixed(2))
                            ) : (
                              <span className="text-secondary font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold">
                            {row.netChange > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                +{formatCurrency(row.netChange.toFixed(2))} (Borrowed)
                              </span>
                            ) : row.netChange < 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                -{formatCurrency(Math.abs(row.netChange).toFixed(2))} (Repaid)
                              </span>
                            ) : (
                              <span className="text-secondary font-normal">Balanced (0)</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {row.status === "overdue" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800 dark:bg-red-950/80 dark:text-red-300">
                                Overdue Dues
                              </span>
                            ) : row.status === "active" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                Active Loans
                              </span>
                            ) : row.status === "repayment_only" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                                Repayments
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                ✓ Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[color:var(--border)] bg-zinc-50/80 dark:bg-zinc-800/80 font-bold">
                        <td className="py-3 px-4 text-ink">Total Summary:</td>
                        <td className="py-3 px-4 text-right text-ink">
                          {formatCurrency(borrowerFinancials.totalPrincipal.toFixed(2))}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(borrowerFinancials.totalRepaid.toFixed(2))}
                        </td>
                        <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400">
                          Net Outstanding: {formatCurrency(borrowerFinancials.outstandingBalance.toFixed(2))}
                        </td>
                        <td className="py-3 px-4 text-center text-xs text-secondary">
                          {borrowerFinancials.overdueLoansCount > 0 ? `${borrowerFinancials.overdueLoansCount} Overdue` : "All on track"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: TRANSACTION LEDGER */}
            {activeTab === "ledger" && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">
                    Chronological Transaction Ledger
                  </h3>
                  <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-[color:var(--border)] shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("all")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                        ledgerFilter === "all" ? "bg-white dark:bg-zinc-900 text-ink shadow-xs" : "text-secondary hover:text-ink"
                      )}
                    >
                      All ({ledgerEvents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("disbursements")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                        ledgerFilter === "disbursements" ? "bg-white dark:bg-zinc-900 text-ink shadow-xs" : "text-secondary hover:text-ink"
                      )}
                    >
                      Borrowings
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("repayments")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                        ledgerFilter === "repayments" ? "bg-white dark:bg-zinc-900 text-ink shadow-xs" : "text-secondary hover:text-ink"
                      )}
                    >
                      Repayments
                    </button>
                  </div>
                </div>

                {ledgerEvents.length === 0 ? (
                  <div className="p-8 text-center text-secondary text-xs rounded-2xl border border-[color:var(--border)] bg-zinc-50/50">
                    No transactions recorded for this filter.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white dark:bg-zinc-900 shadow-xs divide-y divide-[color:var(--border)]">
                    {ledgerEvents.map((evt) => (
                      <div key={evt.id} className="p-3.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                            evt.type === "disbursement"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                          )}>
                            {evt.type === "disbursement" ? "↗" : "↙"}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <strong className="text-xs sm:text-sm font-bold text-ink">
                                {evt.type === "disbursement" ? "Loan Taken" : "Repayment Made"}
                              </strong>
                              {evt.interestInfo && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-semibold">
                                  {evt.interestInfo}
                                </span>
                              )}
                              {evt.isOverdue && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                                  Overdue
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-secondary mt-0.5">
                              <span>{evt.date}</span>
                              {evt.dueDate && (
                                <span>• Due: {evt.dueDate}</span>
                              )}
                              {evt.notes && (
                                <span className="truncate italic">"{evt.notes}"</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <strong className={cn(
                            "text-sm sm:text-base font-extrabold",
                            evt.type === "disbursement" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {evt.type === "disbursement" ? "+" : "-"}{formatCurrency(evt.amount.toFixed(2))}
                          </strong>
                          <span className="block text-[10px] text-secondary capitalize">
                            {evt.type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ALL LOANS LIST WITH QUICK ACTIONS */}
            {activeTab === "loans" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">
                    Individual Loans Tracked for {currentBorrower.name}
                  </h3>
                  <span className="text-xs text-secondary">
                    {currentBorrower.loans.length} loan record{currentBorrower.loans.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {currentBorrower.loans.map((loan) => {
                    const fin = calculateLoanFinancials(loan);

                    return (
                      <div
                        key={loan.id}
                        className={cn(
                          "rounded-2xl border p-4 space-y-3 transition-all",
                          fin.isFullyPaid
                            ? "border-emerald-200/80 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                            : fin.isOverdue
                              ? "border-red-200 bg-red-50/25 dark:border-red-900/40 dark:bg-red-950/10"
                              : "border-[color:var(--border)] bg-white dark:bg-zinc-900/80"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs text-secondary">Lent on: {loan.lending_date}</span>
                            <strong className="block text-lg font-bold text-ink">
                              {formatCurrency(fin.principal.toFixed(2))}
                            </strong>
                          </div>

                          <div>
                            {fin.isFullyPaid ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                ✓ Paid
                              </span>
                            ) : fin.isOverdue ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300">
                                Overdue
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                Active
                              </span>
                            )}
                          </div>
                        </div>

                        {Number(loan.interest_rate) > 0 && (
                          <div className="text-xs flex items-center justify-between text-secondary pt-1 border-t border-[color:var(--border)]">
                            <span>Interest ({loan.interest_rate}% {loan.interest_rate_period}):</span>
                            <span className="font-semibold text-purple-600 dark:text-purple-400">
                              +{formatCurrency(fin.accruedInterest.toFixed(2))}
                            </span>
                          </div>
                        )}

                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-secondary">Repaid: {formatCurrency(fin.totalRepaid.toFixed(2))}</span>
                            <span className="font-bold text-ink">{fin.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", fin.isFullyPaid ? "bg-emerald-500" : "bg-primary")}
                              style={{ width: `${fin.progressPercent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-secondary pt-0.5">
                            <span>{loan.due_date ? `Due: ${loan.due_date}` : "No due date"}</span>
                            <span className="font-bold text-ink">Remaining: {formatCurrency(fin.remainingBalance.toFixed(2))}</span>
                          </div>
                        </div>

                        {loan.notes && (
                          <p className="text-xs text-secondary italic line-clamp-2 bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-xl">
                            "{loan.notes}"
                          </p>
                        )}

                        {!fin.isFullyPaid && onOpenRepayment && (
                          <div className="pt-2 border-t border-[color:var(--border)] flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenRepayment(loan);
                              }}
                              className="ui-button-primary !py-1 !px-2.5 text-xs font-semibold cursor-pointer"
                            >
                              + Record Repayment
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Footer */}
      <div className="border-t border-[color:var(--border)] bg-zinc-50/80 dark:bg-zinc-900/90 px-5 sm:px-6 py-3 flex items-center justify-between">
        <span className="text-xs text-secondary">
          {currentBorrower ? `Statement generated for ${currentBorrower.name}` : ""}
        </span>
        <button
          type="button"
          className="ui-button-primary !py-1.5 !px-4 text-xs font-bold cursor-pointer"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </ModalFrame>
  );
}
