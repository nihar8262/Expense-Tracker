import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { CategoryIcon } from "../components/CategoryIcon";
import { PlatformPicker } from "../components/PlatformPicker";
import { PLATFORMS } from "../lib/platforms";
import { FilterDropdown } from "../components/FilterDropdown";
import {
  EmptyState,
  ItemActionButtons,
  ModalFrame,
  PageHero,
  SectionHeader,
  StatusNotice,
  SurfaceCard,
  cn,
} from "../components/ui";
import { ReceiptScanPanel } from "../components/ReceiptScanPanel";
import { BorrowerMiniStatementModal } from "../components/BorrowerMiniStatementModal";
import { compressGroupImage } from "../utils/imageCompressor";
import type {
  BudgetForm,
  BudgetHistoryRange,
  BudgetSummary,
  CategoryOption,
  SplitRule,
  Wallet,
  WalletDetail,
  WalletBudget,
  WalletLoan,
  WalletLoanForm,
  WalletLoanRepayment,
  WalletLoanRepaymentForm,
} from "../types";

function WalletPicturePicker({
  pictureUrl,
  pictureStats,
  isCompressing,
  error,
  onPictureChange,
  onRemovePicture,
}: {
  pictureUrl: string | null;
  pictureStats: string | null;
  isCompressing: boolean;
  error: string | null;
  onPictureChange: (file: File) => void;
  onRemovePicture: () => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-secondary">Group Picture (Max 15MB, auto WebP)</span>
      <div className="flex items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-white/70 dark:bg-zinc-900/60 p-3.5">
        {pictureUrl ? (
          <div className="relative group shrink-0">
            <img
              src={pictureUrl}
              alt="Group preview"
              className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/30 shadow-md"
            />
            <button
              type="button"
              onClick={onRemovePicture}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold shadow-md hover:bg-rose-600 transition-colors cursor-pointer"
              title="Remove picture"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-dashed border-[color:var(--border)] text-muted shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-xl bg-white dark:bg-zinc-800 border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-ink shadow-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-primary/40 transition-colors">
            <span>{isCompressing ? "Optimizing..." : pictureUrl ? "Change Photo" : "Upload Group Photo"}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isCompressing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onPictureChange(file);
                }
                e.target.value = "";
              }}
            />
          </label>

          {pictureStats ? (
            <p className="text-2xs font-medium text-emerald-700 dark:text-emerald-400">
              ✨ {pictureStats}
            </p>
          ) : (
            <p className="text-2xs text-muted">
              Auto-compressed to crisp WebP. Max file size: 15MB.
            </p>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger-text)] font-medium">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type WalletsPageProps = {
  wallets: Wallet[];
  selectedWallet: WalletDetail | null;
  selectedWalletId: string | null;
  currentUserId: string | null;
  currentUserEmail?: string | null;
  budgetCategoryOptions: CategoryOption[];
  isLoading: boolean;
  isLoadingMoreExpenses?: boolean;
  isSubmitting: boolean;
  submittingAction: string;
  statusMessage: string;
  errorMessage: string;
  formatCurrency: (amount: string, customCurrency?: string) => string;
  onSelectWallet: (walletId: string) => void;
  onCreateWallet: (input: {
    name: string;
    description: string;
    defaultSplitRule: SplitRule;
    currency?: string;
    pictureUrl?: string | null;
    members: Array<{ displayName: string; email?: string }>;
  }) => Promise<boolean>;
  onUpdateWallet: (
    walletId: string,
    input: {
      name: string;
      description: string;
      defaultSplitRule: SplitRule;
      currency?: string;
      pictureUrl?: string | null;
      members: Array<{ displayName: string; email?: string }>;
    },
  ) => Promise<boolean>;
  onDeleteWallet: (walletId: string) => Promise<boolean>;
  onLeaveWallet: (walletId: string) => Promise<boolean>;
  onAddWalletMember: (
    walletId: string,
    input: { displayName: string; email?: string },
  ) => Promise<boolean>;
  onRemoveWalletMember: (
    walletId: string,
    memberId: string,
  ) => Promise<boolean>;
  onCreateWalletExpense: (
    walletId: string,
    input: {
      paidByMemberId: string;
      amount: string;
      category: string;
      description: string;
      date: string;
      splitRule: SplitRule;
      splits: Array<{ memberId: string; value?: string }>;
      platform?: string | null;
    },
  ) => Promise<boolean>;
  onUpdateWalletExpense: (
    walletId: string,
    walletExpenseId: string,
    input: {
      paidByMemberId: string;
      amount: string;
      category: string;
      description: string;
      date: string;
      splitRule: SplitRule;
      splits: Array<{ memberId: string; value?: string }>;
      platform?: string | null;
    },
  ) => Promise<boolean>;
  onDeleteWalletExpenses: (
    walletId: string,
    walletExpenseIds: string[],
  ) => Promise<boolean>;
  onCreateWalletBudget: (
    walletId: string,
    input: BudgetForm,
  ) => Promise<boolean>;
  onUpdateWalletBudget: (
    walletId: string,
    walletBudgetId: string,
    input: BudgetForm,
  ) => Promise<boolean>;
  onDeleteWalletBudget: (
    walletId: string,
    walletBudgetId: string,
  ) => Promise<boolean>;
  onCreateWalletSettlement: (
    walletId: string,
    input: {
      fromMemberId: string;
      toMemberId: string;
      amount: string;
      date: string;
      note: string;
    },
  ) => Promise<boolean>;
  onUpdateWalletSettlement: (
    walletId: string,
    settlementId: string,
    input: {
      fromMemberId: string;
      toMemberId: string;
      amount: string;
      date: string;
      note: string;
    },
  ) => Promise<boolean>;
  onDeleteWalletSettlement: (
    walletId: string,
    settlementId: string,
  ) => Promise<boolean>;
  onCreateWalletLoan?: (
    walletId: string,
    input: WalletLoanForm,
  ) => Promise<boolean>;
  onUpdateWalletLoan?: (
    walletId: string,
    loanId: string,
    input: Partial<WalletLoanForm>,
  ) => Promise<boolean>;
  onDeleteWalletLoan?: (
    walletId: string,
    loanId: string,
  ) => Promise<boolean>;
  onCreateWalletLoanRepayment?: (
    walletId: string,
    loanId: string,
    input: WalletLoanRepaymentForm,
  ) => Promise<boolean>;
  onUpdateWalletLoanRepayment?: (
    walletId: string,
    loanId: string,
    repaymentId: string,
    input: WalletLoanRepaymentForm,
  ) => Promise<boolean>;
  onDeleteWalletLoanRepayment?: (
    walletId: string,
    loanId: string,
    repaymentId: string,
  ) => Promise<boolean>;
  loans?: WalletLoan[];
  isLoansLoading?: boolean;
  onLoadLoans?: (force?: boolean) => Promise<void> | void;
  onCreateStandaloneLoan?: (input: WalletLoanForm) => Promise<boolean>;
  onUpdateStandaloneLoan?: (loanId: string, input: Partial<WalletLoanForm>) => Promise<boolean>;
  onDeleteStandaloneLoan?: (loanId: string) => Promise<boolean>;
  onCreateStandaloneLoanRepayment?: (loanId: string, input: WalletLoanRepaymentForm) => Promise<boolean>;
  onUpdateStandaloneLoanRepayment?: (loanId: string, repaymentId: string, input: WalletLoanRepaymentForm) => Promise<boolean>;
  onDeleteStandaloneLoanRepayment?: (loanId: string, repaymentId: string) => Promise<boolean>;
  currencySymbol?: string;
  onLoadMoreExpenses?: () => Promise<void>;
};

function getTodayIsoDate(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

function getCurrentMonthValue(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

function formatBudgetMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return month;
  }

  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function isBudgetMonthInRange(
  month: string,
  range: BudgetHistoryRange,
): boolean {
  if (range === "all") {
    return true;
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return false;
  }

  const budgetDate = new Date(year, monthNumber - 1, 1);
  const currentDate = new Date();
  const currentMonthDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  );
  const monthDiff =
    (currentMonthDate.getFullYear() - budgetDate.getFullYear()) * 12 +
    (currentMonthDate.getMonth() - budgetDate.getMonth());

  if (monthDiff < 0) {
    return true;
  }

  if (range === "quarter") {
    return monthDiff <= 2;
  }

  if (range === "half-year") {
    return monthDiff <= 5;
  }

  return monthDiff <= 11;
}

const initialWalletBudgetForm: BudgetForm = {
  amount: "",
  scope: "monthly",
  category: "",
  month: getCurrentMonthValue(),
};

function getMemberAvatarUrl(displayName: string, email?: string | null) {
  const hashStr = displayName || email || "User";
  let hash = 0;
  for (let i = 0; i < hashStr.length; i++) {
    hash = hashStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    { bg: "e8f5e9", text: "1b5e20" }, // Green
    { bg: "e3f2fd", text: "0d47a1" }, // Blue
    { bg: "f3e5f5", text: "4a148c" }, // Purple
    { bg: "fff3e0", text: "e65100" }, // Orange
    { bg: "ffebee", text: "b71c1c" }, // Red
    { bg: "f1f8e9", text: "33691e" }, // Light Green
    { bg: "e0f7fa", text: "006064" }, // Cyan
  ];
  const color = colors[Math.abs(hash) % colors.length]!;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=${color.bg}&color=${color.text}&bold=true&size=128`;
}

function getMemberInitials(displayName: string): string {
  if (!displayName) return "U";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return displayName.trim().slice(0, 2).toUpperCase();
}

function getMemberGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #10b981, #059669)", // emerald
    "linear-gradient(135deg, #0284c7, #0369a1)", // sky
    "linear-gradient(135deg, #8b5cf6, #6d28d9)", // purple
    "linear-gradient(135deg, #f59e0b, #d97706)", // amber
    "linear-gradient(135deg, #ec4899, #be185d)", // pink
    "linear-gradient(135deg, #0d9488, #0f766e)", // teal
    "linear-gradient(135deg, #6366f1, #4338ca)", // indigo
    "linear-gradient(135deg, #f97316, #c2410c)", // orange
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length]!;
}

function parseMemberEntries(
  rawValue: string,
): Array<{ displayName: string; email?: string }> {
  return rawValue
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const emailMatch = entry.match(/^(.*)<([^>]+)>$/);

      if (!emailMatch) {
        return { displayName: entry };
      }

      const displayName = emailMatch[1]?.trim();
      const email = emailMatch[2]?.trim();
      return {
        displayName: displayName || email || entry,
        email: email || undefined,
      };
    });
}

export function WalletsPage({
  wallets,
  selectedWallet,
  selectedWalletId,
  currentUserId,
  currentUserEmail,
  budgetCategoryOptions,
  isLoading,
  isLoadingMoreExpenses = false,
  isSubmitting,
  submittingAction,
  statusMessage,
  errorMessage,
  formatCurrency,
  onSelectWallet,
  onCreateWallet,
  onUpdateWallet,
  onDeleteWallet,
  onLeaveWallet,
  onAddWalletMember,
  onRemoveWalletMember,
  onCreateWalletExpense,
  onUpdateWalletExpense,
  onDeleteWalletExpenses,
  onCreateWalletBudget,
  onUpdateWalletBudget,
  onDeleteWalletBudget,
  onCreateWalletSettlement,
  onUpdateWalletSettlement,
  onDeleteWalletSettlement,
  onCreateWalletLoan,
  onUpdateWalletLoan,
  onDeleteWalletLoan,
  onCreateWalletLoanRepayment,
  onUpdateWalletLoanRepayment,
  onDeleteWalletLoanRepayment,
  loans = [],
  isLoansLoading = false,
  onLoadLoans,
  onCreateStandaloneLoan,
  onUpdateStandaloneLoan,
  onDeleteStandaloneLoan,
  onCreateStandaloneLoanRepayment,
  onUpdateStandaloneLoanRepayment,
  onDeleteStandaloneLoanRepayment,
  currencySymbol = "₹",
  onLoadMoreExpenses
}: WalletsPageProps) {
  const [walletName, setWalletName] = useState("");
  const [walletDescription, setWalletDescription] = useState("");
  const [walletMembersText, setWalletMembersText] = useState("");
  const [walletSplitRule, setWalletSplitRule] = useState<SplitRule>("equal");
  const [walletCurrency, setWalletCurrency] = useState("INR");
  const [isCreateWalletModalOpen, setIsCreateWalletModalOpen] = useState(false);
  const [walletPictureUrl, setWalletPictureUrl] = useState<string | null>(null);
  const [walletPictureStats, setWalletPictureStats] = useState<string | null>(null);
  const [isCompressingPicture, setIsCompressingPicture] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);

  const [isWalletEditModalOpen, setIsWalletEditModalOpen] = useState(false);
  const [editWalletName, setEditWalletName] = useState("");
  const [editWalletDescription, setEditWalletDescription] = useState("");
  const [editWalletMembersText, setEditWalletMembersText] = useState("");
  const [editWalletSplitRule, setEditWalletSplitRule] = useState<SplitRule>("equal");
  const [editWalletCurrency, setEditWalletCurrency] = useState("INR");
  const [editWalletPictureUrl, setEditWalletPictureUrl] = useState<string | null>(null);
  const [editWalletPictureStats, setEditWalletPictureStats] = useState<string | null>(null);
  const [isCompressingEditPicture, setIsCompressingEditPicture] = useState(false);
  const [editPictureError, setEditPictureError] = useState<string | null>(null);
  const [showEditWalletValidation, setShowEditWalletValidation] = useState(false);
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [walletSubTab, setWalletSubTab] = useState<"overview" | "transactions" | "budget" | "members" | "all">("overview");

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayIsoDate());
  const [expenseSplitRule, setExpenseSplitRule] = useState<SplitRule>("equal");
  const [expensePayerId, setExpensePayerId] = useState("");
  const [selectedSplitMemberIds, setSelectedSplitMemberIds] = useState<
    string[]
  >([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [alreadySettledMemberIds, setAlreadySettledMemberIds] = useState<
    string[]
  >([]);
  const [editingWalletExpenseId, setEditingWalletExpenseId] = useState<
    string | null
  >(null);
  const [expensePlatform, setExpensePlatform] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "single" | "selected";
    expenseId?: string;
    description: string;
    amount?: string;
  } | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);

  const [settlementFromMemberId, setSettlementFromMemberId] = useState("");
  const [settlementToMemberId, setSettlementToMemberId] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(getTodayIsoDate());
  const [settlementNote, setSettlementNote] = useState("");
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(
    null,
  );
  const [deletingExpenseIds, setDeletingExpenseIds] = useState<string[]>([]);
  const [deletingSettlementIds, setDeletingSettlementIds] = useState<string[]>(
    [],
  );
  const [isDeletingWallet, setIsDeletingWallet] = useState(false);
  const [isLeavingWallet, setIsLeavingWallet] = useState(false);
  const [removingMemberIds, setRemovingMemberIds] = useState<string[]>([]);
  const [isMobileExpenseModalOpen, setIsMobileExpenseModalOpen] =
    useState(false);
  const [isMobileSettlementModalOpen, setIsMobileSettlementModalOpen] =
    useState(false);
  const [walletBudgetForm, setWalletBudgetForm] = useState<BudgetForm>(
    initialWalletBudgetForm,
  );
  const [editingWalletBudgetId, setEditingWalletBudgetId] = useState<
    string | null
  >(null);
  const [deletingWalletBudgetIds, setDeletingWalletBudgetIds] = useState<
    string[]
  >([]);
  const [walletBudgetHistoryRange, setWalletBudgetHistoryRange] =
    useState<BudgetHistoryRange>("half-year");
  const [isWalletBudgetHistoryOpen, setIsWalletBudgetHistoryOpen] =
    useState(false);
  const [walletBudgetStatusMessage, setWalletBudgetStatusMessage] =
    useState("");
  const [walletBudgetErrorMessage, setWalletBudgetErrorMessage] = useState("");

  const [showCreateWalletValidation, setShowCreateWalletValidation] =
    useState(false);
  const [showExpenseValidation, setShowExpenseValidation] = useState(false);
  const [showSettlementValidation, setShowSettlementValidation] =
    useState(false);
  const [showMemberValidation, setShowMemberValidation] = useState(false);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseFilterMonth, setExpenseFilterMonth] = useState("all");
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("all");
  const [expenseFilterAmount, setExpenseFilterAmount] = useState("all");
  const [expenseFilterPlatform, setExpenseFilterPlatform] = useState("all");
  const [currentWalletExpensesPage, setCurrentWalletExpensesPage] = useState(1);

  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementFilterMonth, setSettlementFilterMonth] = useState("all");
  const [settlementFilterAmount, setSettlementFilterAmount] = useState("all");

  // View Mode: Shared Wallets vs Peer Loans
  const [viewMode, setViewMode] = useState<"wallets" | "loans">("wallets");

  useEffect(() => {
    if (viewMode === "loans" && onLoadLoans) {
      void onLoadLoans();
    }
  }, [viewMode, onLoadLoans]);

  // Loan & Lending Hub State
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<WalletLoan | null>(null);
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [activeLoanForRepayment, setActiveLoanForRepayment] = useState<WalletLoan | null>(null);
  const [selectedLoanForDetails, setSelectedLoanForDetails] = useState<WalletLoan | null>(null);
  const [standaloneSearch, setStandaloneSearch] = useState("");
  const [standaloneFilterStatus, setStandaloneFilterStatus] = useState("all");
  const [deletingLoanIds, setDeletingLoanIds] = useState<string[]>([]);
  const [deletingLoanRepaymentIds, setDeletingLoanRepaymentIds] = useState<string[]>([]);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementBorrowerKey, setStatementBorrowerKey] = useState<string | null>(null);
  const [isDismissedOverdueAlert, setIsDismissedOverdueAlert] = useState(false);

  function handleOpenBorrowerStatement(borrowerKey?: string | null) {
    setStatementBorrowerKey(borrowerKey || null);
    setIsStatementModalOpen(true);
  }

  // Loan Form State
  const [loanBorrowerId, setLoanBorrowerId] = useState("");
  const [loanBorrowerName, setLoanBorrowerName] = useState("");
  const [loanBorrowerEmail, setLoanBorrowerEmail] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanInterestRate, setLoanInterestRate] = useState("0");
  const [loanInterestType, setLoanInterestType] = useState<"percentage" | "fixed" | "none">("percentage");
  const [loanInterestPeriod, setLoanInterestPeriod] = useState<"monthly" | "yearly" | "one-time">("monthly");
  const [loanLendingDate, setLoanLendingDate] = useState(getTodayIsoDate());
  const [loanInterestStartDate, setLoanInterestStartDate] = useState("");
  const [loanDueDate, setLoanDueDate] = useState("");
  const [loanNotes, setLoanNotes] = useState("");
  const [showLoanValidation, setShowLoanValidation] = useState(false);

  // Repayment Form State
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(getTodayIsoDate());
  const [repaymentNotes, setRepaymentNotes] = useState("");
  const [showRepaymentValidation, setShowRepaymentValidation] = useState(false);

  // Loans View Navigation & Mode State
  const [loanTab, setLoanTab] = useState<"lent" | "borrowed" | "statement">("lent");
  const [loanType, setLoanType] = useState<"lent" | "borrowed">("lent");
  const [statementSearch, setStatementSearch] = useState("");
  const [statementFilterType, setStatementFilterType] = useState<"all" | "lent" | "borrowed" | "repayments">("all");

  // Edit Repayment State
  const [editingRepayment, setEditingRepayment] = useState<{ loan: WalletLoan; repayment: WalletLoanRepayment } | null>(null);
  const [editRepaymentAmount, setEditRepaymentAmount] = useState("");
  const [editRepaymentDate, setEditRepaymentDate] = useState("");
  const [editRepaymentNotes, setEditRepaymentNotes] = useState("");
  const [showEditRepaymentValidation, setShowEditRepaymentValidation] = useState(false);

  const createWalletErrors = useMemo(
    () => ({
      name: walletName.trim() ? "" : "Wallet name is required.",
    }),
    [walletName],
  );

  const editWalletErrors = useMemo(
    () => ({
      name: editWalletName.trim() ? "" : "Wallet name is required.",
    }),
    [editWalletName],
  );

  const expenseErrors = useMemo(() => {
    const errors = {
      amount: "",
      category: "",
      description: "",
      date: ""
    };

    const amountTrimmed = expenseAmount.trim();
    if (!amountTrimmed) {
      errors.amount = "Please enter the group expense amount.";
    } else {
      const amountNum = parseFloat(amountTrimmed);
      if (isNaN(amountNum) || amountNum <= 0) {
        errors.amount = "Amount must be a positive number.";
      }
    }

    if (!expenseCategory.trim()) {
      errors.category = "Please select a category for the group expense.";
    }

    const descTrimmed = expenseDescription.trim();
    if (!descTrimmed) {
      errors.description = "Please enter a description for the group expense.";
    } else if (descTrimmed.length < 3) {
      errors.description = "Description must be at least 3 characters long.";
    }

    if (!expenseDate.trim()) {
      errors.date = "Please select a date for the transaction.";
    }

    return errors;
  }, [expenseAmount, expenseCategory, expenseDescription, expenseDate]);

  const settlementErrors = useMemo(
    () => ({
      amount: settlementAmount.trim() ? "" : "Amount is required.",
      date: settlementDate.trim() ? "" : "Date is required.",
    }),
    [settlementAmount, settlementDate],
  );

  const memberErrors = useMemo(
    () => ({
      displayName: inviteDisplayName.trim() ? "" : "Member name is required.",
      email: !inviteEmail.trim()
        ? "Email is required."
        : selectedWallet?.members.some(
              (m) =>
                m.email &&
                m.email.toLowerCase() === inviteEmail.trim().toLowerCase(),
            )
          ? "This email is already in the wallet."
          : "",
    }),
    [inviteDisplayName, inviteEmail, selectedWallet],
  );

  function calculateLoanFinancials(loan: WalletLoan) {
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
    const isOverpaid = totalRepaid > totalDue + 0.001 && totalDue > 0;
    const overpaidAmount = isOverpaid ? totalRepaid - totalDue : 0;
    const remainingBalance = Math.max(0, totalDue - totalRepaid);
    const isFullyPaid = (totalRepaid >= totalDue && totalDue > 0) || isOverpaid;
    const progressPercent = totalDue > 0 ? Math.min(100, Math.round((totalRepaid / totalDue) * 100)) : 100;

    const isOverdue = Boolean(loan.due_date && new Date(loan.due_date) < new Date() && remainingBalance > 0);

    return {
      principal,
      accruedInterest,
      totalDue,
      totalRepaid,
      remainingBalance,
      isFullyPaid,
      isOverpaid,
      overpaidAmount,
      progressPercent,
      isOverdue
    };
  }

  const myOverdueLoans = useMemo(() => {
    const candidateLoans = [...(loans || [])];
    if (selectedWallet?.loans) {
      for (const wLoan of selectedWallet.loans) {
        if (!candidateLoans.some((l) => l.id === wLoan.id)) {
          candidateLoans.push(wLoan);
        }
      }
    }

    const currentEmail = currentUserEmail?.trim().toLowerCase();

    return candidateLoans.filter((loan) => {
      const matchesEmail = Boolean(currentEmail && loan.borrower_email && loan.borrower_email.trim().toLowerCase() === currentEmail);
      const isMemberBorrower = Boolean(
        currentUserId &&
        loan.borrower_member_id &&
        selectedWallet?.members?.some((m) => m.id === loan.borrower_member_id && (m.user_id === currentUserId || (currentEmail && m.email?.toLowerCase() === currentEmail)))
      );

      if (!matchesEmail && !isMemberBorrower) {
        return false;
      }

      const financials = calculateLoanFinancials(loan);
      return financials.isOverdue && financials.remainingBalance > 0;
    });
  }, [loans, selectedWallet, currentUserId, currentUserEmail]);

  function isRawUserId(val?: string | null): boolean {
    if (!val || typeof val !== "string") return false;
    const trimmed = val.trim();
    return /^[0-9a-fA-F-]{20,}$/.test(trimmed) || trimmed.startsWith("auth0|") || trimmed.startsWith("user_");
  }

  function getLoanBorrowerName(loan: WalletLoan): string {
    if (loan.is_owner === false) {
      if (loan.creator_name && !isRawUserId(loan.creator_name)) return loan.creator_name;
      if (loan.creator_email) return loan.creator_email.split("@")[0];
      return "Loan Owner";
    }

    if (loan.borrower_name && !isRawUserId(loan.borrower_name)) return loan.borrower_name;
    if (loan.borrower_member_name && !isRawUserId(loan.borrower_member_name)) return loan.borrower_member_name;
    if (loan.borrower_member_id && selectedWallet?.members) {
      const m = selectedWallet.members.find((member) => member.id === loan.borrower_member_id);
      if (m?.display_name && !isRawUserId(m.display_name)) return m.display_name;
    }
    if (loan.borrower_email) return loan.borrower_email.split("@")[0];
    return "Borrower";
  }

  function getLoanBorrowerEmail(loan: WalletLoan): string | null {
    if (loan.is_owner === false) {
      return loan.creator_email || null;
    }
    if (loan.borrower_email) return loan.borrower_email;
    if (loan.borrower_member_id && selectedWallet?.members) {
      const m = selectedWallet.members.find((member) => member.id === loan.borrower_member_id);
      if (m?.email) return m.email;
    }
    return null;
  }

  const standaloneLoansList = useMemo(() => loans || [], [loans]);

  const lentLoansList = useMemo(() => {
    return standaloneLoansList.filter((loan) => (loan.loan_type || "lent") !== "borrowed");
  }, [standaloneLoansList]);

  const borrowedLoansList = useMemo(() => {
    return standaloneLoansList.filter((loan) => loan.loan_type === "borrowed");
  }, [standaloneLoansList]);

  const lentLoansAggregate = useMemo(() => {
    let totalLent = 0;
    let totalInterest = 0;
    let totalRepaid = 0;
    let totalRemaining = 0;
    let activeCount = 0;

    for (const loan of lentLoansList) {
      const { principal, accruedInterest, totalRepaid: repaid, remainingBalance, isFullyPaid } = calculateLoanFinancials(loan);
      totalLent += principal;
      totalInterest += accruedInterest;
      totalRepaid += repaid;
      totalRemaining += remainingBalance;
      if (!isFullyPaid) {
        activeCount++;
      }
    }

    return {
      totalLent,
      totalInterest,
      totalRepaid,
      totalRemaining,
      activeCount,
      totalLoans: lentLoansList.length
    };
  }, [lentLoansList]);

  const borrowedLoansAggregate = useMemo(() => {
    let totalBorrowed = 0;
    let totalInterest = 0;
    let totalPaidBack = 0;
    let totalRemaining = 0;
    let activeCount = 0;

    for (const loan of borrowedLoansList) {
      const { principal, accruedInterest, totalRepaid: repaid, remainingBalance, isFullyPaid } = calculateLoanFinancials(loan);
      totalBorrowed += principal;
      totalInterest += accruedInterest;
      totalPaidBack += repaid;
      totalRemaining += remainingBalance;
      if (!isFullyPaid) {
        activeCount++;
      }
    }

    return {
      totalBorrowed,
      totalInterest,
      totalPaidBack,
      totalRemaining,
      activeCount,
      totalLoans: borrowedLoansList.length
    };
  }, [borrowedLoansList]);


  const currentCategoryLoans = useMemo(() => {
    if (loanTab === "borrowed") return borrowedLoansList;
    return lentLoansList;
  }, [loanTab, lentLoansList, borrowedLoansList]);

  const filteredStandaloneLoans = useMemo(() => {
    return currentCategoryLoans.filter((loan) => {
      const bName = getLoanBorrowerName(loan).toLowerCase();
      const bEmail = (getLoanBorrowerEmail(loan) || "").toLowerCase();
      const search = standaloneSearch.trim().toLowerCase();
      if (search && !bName.includes(search) && !bEmail.includes(search)) {
        return false;
      }
      const { isFullyPaid, isOverdue } = calculateLoanFinancials(loan);
      if (standaloneFilterStatus === "active" && isFullyPaid) {
        return false;
      }
      if (standaloneFilterStatus === "repaid" && !isFullyPaid) {
        return false;
      }
      if (standaloneFilterStatus === "overdue" && !isOverdue) {
        return false;
      }
      return true;
    });
  }, [currentCategoryLoans, standaloneSearch, standaloneFilterStatus]);

  type UnifiedStatementEntry = {
    id: string;
    date: string;
    type: "loan_lent" | "loan_borrowed" | "repayment_received" | "repayment_paid";
    counterparty: string;
    counterpartyEmail?: string | null;
    notes?: string | null;
    amount: number;
    loan: WalletLoan;
    repaymentId?: string;
  };

  const unifiedStatementItems = useMemo(() => {
    const items: UnifiedStatementEntry[] = [];
    for (const loan of standaloneLoansList) {
      const counterparty = getLoanBorrowerName(loan);
      const counterpartyEmail = getLoanBorrowerEmail(loan);
      const isBorrowed = loan.loan_type === "borrowed";

      items.push({
        id: `loan-${loan.id}`,
        date: loan.lending_date,
        type: isBorrowed ? "loan_borrowed" : "loan_lent",
        counterparty,
        counterpartyEmail,
        notes: loan.notes || (isBorrowed ? "Borrowed principal received" : "Loan principal disbursed"),
        amount: parseFloat(loan.amount) || 0,
        loan
      });

      if (loan.repayments && loan.repayments.length > 0) {
        for (const rep of loan.repayments) {
          items.push({
            id: `rep-${rep.id}`,
            date: rep.repayment_date,
            type: isBorrowed ? "repayment_paid" : "repayment_received",
            counterparty,
            counterpartyEmail,
            notes: rep.notes || (isBorrowed ? "Installment paid to lender" : "Repayment collected from borrower"),
            amount: parseFloat(rep.amount) || 0,
            loan,
            repaymentId: rep.id
          });
        }
      }
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [standaloneLoansList]);

  const filteredStatementItems = useMemo(() => {
    return unifiedStatementItems.filter((item) => {
      const search = statementSearch.trim().toLowerCase();
      if (search) {
        const cp = item.counterparty.toLowerCase();
        const em = (item.counterpartyEmail || "").toLowerCase();
        const nt = (item.notes || "").toLowerCase();
        if (!cp.includes(search) && !em.includes(search) && !nt.includes(search)) {
          return false;
        }
      }

      if (statementFilterType === "lent" && item.type !== "loan_lent") return false;
      if (statementFilterType === "borrowed" && item.type !== "loan_borrowed") return false;
      if (statementFilterType === "repayments" && item.type !== "repayment_received" && item.type !== "repayment_paid") return false;

      return true;
    });
  }, [unifiedStatementItems, statementSearch, statementFilterType]);



  const loanErrors = useMemo(() => {
    const errors = {
      borrower: "",
      amount: "",
      interestRate: "",
      lendingDate: "",
    };

    const isStandaloneForm = viewMode === "loans" || !selectedWallet;
    if (isStandaloneForm) {
      if (!loanBorrowerName.trim()) {
        errors.borrower = loanType === "borrowed" ? "Lender name is required." : "Borrower name is required.";
      }
    } else {
      if (!loanBorrowerId.trim()) {
        errors.borrower = "Please select a member.";
      }
    }

    const amt = parseFloat(loanAmount.trim());
    if (!loanAmount.trim()) {
      errors.amount = "Loan amount is required.";
    } else if (isNaN(amt) || amt <= 0) {
      errors.amount = "Amount must be a positive number.";
    }

    const rate = parseFloat(loanInterestRate.trim());
    if (loanInterestRate.trim() && (isNaN(rate) || rate < 0)) {
      errors.interestRate = "Interest rate cannot be negative.";
    }

    if (!loanLendingDate.trim()) {
      errors.lendingDate = loanType === "borrowed" ? "Borrowing date is required." : "Lending date is required.";
    }

    return errors;
  }, [viewMode, selectedWallet, loanBorrowerId, loanBorrowerName, loanAmount, loanInterestRate, loanLendingDate, loanType]);

  const repaymentErrors = useMemo(() => {
    const errors = {
      amount: "",
      date: ""
    };
    const amt = parseFloat(repaymentAmount.trim());
    if (!repaymentAmount.trim()) {
      errors.amount = "Repayment amount is required.";
    } else if (isNaN(amt) || amt <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }
    if (!repaymentDate.trim()) {
      errors.date = "Repayment date is required.";
    }
    return errors;
  }, [repaymentAmount, repaymentDate]);

  const walletBudgetCategoryChoices = useMemo(() => {
    const optionsByLabel = new Map<string, CategoryOption>();

    for (const option of budgetCategoryOptions) {
      optionsByLabel.set(option.label.toLowerCase(), option);
    }

    for (const expense of selectedWallet?.expenses ?? []) {
      const key = expense.category.toLowerCase();
      if (!optionsByLabel.has(key)) {
        optionsByLabel.set(key, {
          id:
            key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
            "wallet-category",
          label: expense.category,
          icon: "other",
        });
      }
    }

    return [...optionsByLabel.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [budgetCategoryOptions, selectedWallet]);

  const currentWalletMember = useMemo(
    () =>
      selectedWallet?.members.find(
        (member) => member.user_id === currentUserId,
      ) ?? null,
    [currentUserId, selectedWallet],
  );
  const isWalletOwner = currentWalletMember?.role === "owner";

  const targetWalletSummary = useMemo(
    () => wallets.find((w) => w.id === selectedWalletId) ?? null,
    [wallets, selectedWalletId],
  );

  const isSwitchingWallet = Boolean(
    (isLoading && (!selectedWallet || selectedWallet.wallet.id !== selectedWalletId)) ||
    (selectedWalletId && (!selectedWallet || selectedWallet.wallet.id !== selectedWalletId))
  );

  const displayWallet = useMemo(() => {
    if (selectedWallet && selectedWallet.wallet.id === selectedWalletId) {
      return selectedWallet.wallet;
    }
    return targetWalletSummary;
  }, [selectedWallet, selectedWalletId, targetWalletSummary]);

  const walletBudgetSummaries = useMemo<BudgetSummary[]>(() => {
    if (!selectedWallet) {
      return [];
    }

    return selectedWallet.budgets
      .map((budget: WalletBudget) => {
        const spent = selectedWallet.expenses
          .filter((expense) => expense.date.slice(0, 7) === budget.month)
          .filter((expense) =>
            budget.scope === "category"
              ? expense.category === budget.category
              : true,
          )
          .reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalBudgetAmount = Number(budget.amount);
        const remaining = totalBudgetAmount - spent;

        return {
          ...budget,
          spent,
          remaining,
          formattedAmount: formatCurrency(budget.amount, selectedWallet.wallet.currency),
          formattedSpent: formatCurrency(spent.toFixed(2), selectedWallet.wallet.currency),
          formattedRemaining: formatCurrency(remaining.toFixed(2), selectedWallet.wallet.currency),
          isOverspent: remaining < 0,
        };
      })
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);

        if (byMonth !== 0) {
          return byMonth;
        }

        if (left.scope !== right.scope) {
          return left.scope === "monthly" ? -1 : 1;
        }

        return (left.category ?? "").localeCompare(right.category ?? "");
      });
  }, [formatCurrency, selectedWallet]);

  const currentWalletBudgetMonth = getCurrentMonthValue();
  const currentWalletBudgetMonthLabel = formatBudgetMonth(
    currentWalletBudgetMonth,
  );
  const currentMonthWalletBudgetSummaries = useMemo(
    () =>
      walletBudgetSummaries.filter(
        (budget) => budget.month === currentWalletBudgetMonth,
      ),
    [currentWalletBudgetMonth, walletBudgetSummaries],
  );

  const currentMonthWalletBudgetOverview = useMemo(() => {
    const totalBudgetAmount = currentMonthWalletBudgetSummaries.reduce(
      (sum, budget) => sum + Number(budget.amount),
      0,
    );
    const totalSpentAmount = currentMonthWalletBudgetSummaries.reduce(
      (sum, budget) => sum + budget.spent,
      0,
    );
    const totalRemainingAmount = totalBudgetAmount - totalSpentAmount;

    return {
      totalBudget: formatCurrency(totalBudgetAmount.toFixed(2), selectedWallet?.wallet.currency),
      totalSpent: formatCurrency(totalSpentAmount.toFixed(2), selectedWallet?.wallet.currency),
      totalRemaining: formatCurrency(totalRemainingAmount.toFixed(2), selectedWallet?.wallet.currency),
      isOverspent: totalRemainingAmount < 0,
    };
  }, [currentMonthWalletBudgetSummaries, selectedWallet, formatCurrency]);

  const walletBudgetHistoryGroups = useMemo(() => {
    const filteredBudgets = walletBudgetSummaries.filter((budget) =>
      isBudgetMonthInRange(budget.month, walletBudgetHistoryRange),
    );
    const groupedBudgets = new Map<string, BudgetSummary[]>();

    for (const budget of filteredBudgets) {
      const existing = groupedBudgets.get(budget.month) ?? [];
      existing.push(budget);
      groupedBudgets.set(budget.month, existing);
    }

    return [...groupedBudgets.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([month, items]) => ({
        month,
        label: formatBudgetMonth(month),
        items,
      }));
  }, [walletBudgetHistoryRange, walletBudgetSummaries]);

  const expenseMonthOptions = useMemo(() => {
    const months = new Set(
      (selectedWallet?.expenses ?? []).map((e) => e.date.slice(0, 7)),
    );
    return [...months].sort().reverse();
  }, [selectedWallet]);

  const expenseCategoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const opt of budgetCategoryOptions) {
      if (opt.label && opt.id !== "others") {
        cats.add(opt.label);
      }
    }
    for (const e of selectedWallet?.expenses ?? []) {
      if (e.category) {
        cats.add(e.category);
      }
    }
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [budgetCategoryOptions, selectedWallet]);

  const settlementMonthOptions = useMemo(() => {
    const months = new Set(
      (selectedWallet?.settlements ?? []).map((s) => s.date.slice(0, 7)),
    );
    return [...months].sort().reverse();
  }, [selectedWallet]);

  function filterByAmount<T extends { amount: string }>(
    items: T[],
    filter: string,
  ): T[] {
    if (filter === "all") return items;
    const num = (item: T) => Number(item.amount);
    if (filter === "lt100") return items.filter((i) => num(i) < 100);
    if (filter === "100to500")
      return items.filter((i) => num(i) >= 100 && num(i) <= 500);
    if (filter === "gt500") return items.filter((i) => num(i) > 500);
    return items;
  }

  const filteredExpenses = useMemo(() => {
    let items = selectedWallet?.expenses ?? [];
    if (expenseFilterMonth !== "all")
      items = items.filter((e) => e.date.slice(0, 7) === expenseFilterMonth);
    if (expenseFilterCategory !== "all")
      items = items.filter((e) => e.category === expenseFilterCategory);
    if (expenseFilterPlatform !== "all") {
      if (expenseFilterPlatform === "none") {
        items = items.filter((e) => !e.platform);
      } else {
        items = items.filter((e) => e.platform === expenseFilterPlatform);
      }
    }
    return filterByAmount(items, expenseFilterAmount);
  }, [
    selectedWallet,
    expenseFilterMonth,
    expenseFilterCategory,
    expenseFilterPlatform,
    expenseFilterAmount,
  ]);

  const WALLET_EXPENSES_PAGE_SIZE = 20;
  const totalWalletExpensePages = Math.max(
    1,
    Math.ceil(filteredExpenses.length / WALLET_EXPENSES_PAGE_SIZE),
  );
  const paginatedWalletExpenses = useMemo(() => {
    const startIndex =
      (currentWalletExpensesPage - 1) * WALLET_EXPENSES_PAGE_SIZE;
    return filteredExpenses.slice(
      startIndex,
      startIndex + WALLET_EXPENSES_PAGE_SIZE,
    );
  }, [currentWalletExpensesPage, filteredExpenses]);

  useEffect(() => {
    setCurrentWalletExpensesPage(1);
  }, [
    expenseFilterMonth,
    expenseFilterCategory,
    expenseFilterPlatform,
    expenseFilterAmount,
    selectedWalletId,
  ]);

  const filteredSettlements = useMemo(() => {
    let items = selectedWallet?.settlements ?? [];
    if (settlementFilterMonth !== "all")
      items = items.filter((s) => s.date.slice(0, 7) === settlementFilterMonth);
    return filterByAmount(items, settlementFilterAmount);
  }, [selectedWallet, settlementFilterMonth, settlementFilterAmount]);

  const activeExpenseFilters = useMemo(() => {
    return [
      expenseFilterMonth !== "all"
        ? `Month: ${formatBudgetMonth(expenseFilterMonth)}`
        : null,
      expenseFilterCategory !== "all"
        ? `Category: ${expenseFilterCategory}`
        : null,
      expenseFilterAmount !== "all"
        ? `Amount: ${
            expenseFilterAmount === "lt100"
              ? "Under 100"
              : expenseFilterAmount === "100to500"
                ? "100 - 500"
                : "Over 500"
          }`
        : null,
      expenseFilterPlatform !== "all"
        ? `Platform: ${
            expenseFilterPlatform === "none"
              ? "None"
              : (PLATFORMS.find((p) => p.id === expenseFilterPlatform)?.name ??
                expenseFilterPlatform)
          }`
        : null,
    ].filter(Boolean) as string[];
  }, [
    expenseFilterMonth,
    expenseFilterCategory,
    expenseFilterAmount,
    expenseFilterPlatform,
  ]);

  useEffect(() => {
    if (!selectedWallet) {
      setExpensePayerId("");
      setSelectedSplitMemberIds([]);
      setSettlementFromMemberId("");
      setSettlementToMemberId("");
      return;
    }

    const memberIds = selectedWallet.members.map((member) => member.id);
    setExpenseSplitRule(selectedWallet.wallet.default_split_rule);
    setExpensePayerId((current) =>
      current && memberIds.includes(current) ? current : (memberIds[0] ?? ""),
    );
    setSelectedSplitMemberIds((current) =>
      current.length > 0
        ? current.filter((memberId) => memberIds.includes(memberId))
        : memberIds,
    );
    setSettlementFromMemberId((current) =>
      current && memberIds.includes(current) ? current : (memberIds[0] ?? ""),
    );
    setSettlementToMemberId((current) =>
      current && memberIds.includes(current)
        ? current
        : (memberIds[1] ?? memberIds[0] ?? ""),
    );
    setInviteDisplayName("");
    setInviteEmail("");
    setEditingWalletExpenseId(null);
    setAlreadySettledMemberIds([]);
    setEditingSettlementId(null);
    setWalletBudgetForm({
      ...initialWalletBudgetForm,
      month: getCurrentMonthValue(),
    });
    setEditingWalletBudgetId(null);
    setDeletingWalletBudgetIds([]);
    setIsWalletBudgetHistoryOpen(false);
    setWalletBudgetStatusMessage("");
    setWalletBudgetErrorMessage("");
    setShowExpenseValidation(false);
    setShowSettlementValidation(false);
    setShowCreateWalletValidation(false);
    setShowMemberValidation(false);
    setSelectedExpenseIds([]);
  }, [selectedWallet]);

  function handleWalletBudgetFormChange(
    updater: (current: BudgetForm) => BudgetForm,
  ) {
    setWalletBudgetForm((current) => {
      const nextBudgetForm = updater(current);

      if (nextBudgetForm.scope === "monthly") {
        return {
          ...nextBudgetForm,
          category: "",
        };
      }

      return nextBudgetForm;
    });
  }

  function handleToggleSplitMember(memberId: string) {
    setSelectedSplitMemberIds((current) => {
      if (current.includes(memberId)) {
        setAlreadySettledMemberIds((settled) =>
          settled.filter((id) => id !== memberId),
        );
        return current.filter((id) => id !== memberId);
      }

      return [...current, memberId];
    });
  }

  function handleToggleAlreadySettled(memberId: string) {
    setAlreadySettledMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function handlePictureChange(file: File) {
    setPictureError(null);
    setIsCompressingPicture(true);
    try {
      const res = await compressGroupImage(file);
      setWalletPictureUrl(res.dataUrl);
      setWalletPictureStats(`${res.originalSizeFormatted} → ${res.compressedSizeFormatted} WebP (${res.reductionPercent}% saved)`);
    } catch (err) {
      setPictureError(err instanceof Error ? err.message : "Failed to compress image.");
    } finally {
      setIsCompressingPicture(false);
    }
  }

  async function handleEditPictureChange(file: File) {
    setEditPictureError(null);
    setIsCompressingEditPicture(true);
    try {
      const res = await compressGroupImage(file);
      setEditWalletPictureUrl(res.dataUrl);
      setEditWalletPictureStats(`${res.originalSizeFormatted} → ${res.compressedSizeFormatted} WebP (${res.reductionPercent}% saved)`);
    } catch (err) {
      setEditPictureError(err instanceof Error ? err.message : "Failed to compress image.");
    } finally {
      setIsCompressingEditPicture(false);
    }
  }

  async function handleCreateWalletSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowCreateWalletValidation(true);

    if (Object.values(createWalletErrors).some(Boolean)) {
      Object.values(createWalletErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    const members = parseMemberEntries(walletMembersText);

    const created = await onCreateWallet({
      name: walletName,
      description: walletDescription,
      defaultSplitRule: walletSplitRule,
      currency: walletCurrency,
      pictureUrl: walletPictureUrl,
      members,
    });

    if (created) {
      setWalletName("");
      setWalletDescription("");
      setWalletMembersText("");
      setWalletSplitRule("equal");
      setWalletCurrency("INR");
      setWalletPictureUrl(null);
      setWalletPictureStats(null);
      setPictureError(null);
      setShowCreateWalletValidation(false);
      setIsCreateWalletModalOpen(false);
    }
  }

  function handleStartWalletEdit() {
    if (!selectedWallet) return;
    setEditWalletName(selectedWallet.wallet.name);
    setEditWalletDescription(selectedWallet.wallet.description ?? "");
    setEditWalletSplitRule(selectedWallet.wallet.default_split_rule);
    setEditWalletCurrency(selectedWallet.wallet.currency || "INR");
    setEditWalletPictureUrl(selectedWallet.wallet.picture_url ?? null);
    setEditWalletPictureStats(null);
    setEditPictureError(null);

    const otherMembers = selectedWallet.members.filter((m) => m.role !== "owner");
    const membersText = otherMembers
      .map((m) => {
        if (m.email) {
          return `${m.display_name} <${m.email}>`;
        }
        return m.display_name;
      })
      .join("\n");
    setEditWalletMembersText(membersText);

    setShowEditWalletValidation(false);
    setIsWalletEditModalOpen(true);
  }

  function handleCancelWalletEdit() {
    setIsWalletEditModalOpen(false);
    setShowEditWalletValidation(false);
    setEditWalletPictureUrl(null);
    setEditWalletPictureStats(null);
    setEditPictureError(null);
  }

  async function handleUpdateWalletSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowEditWalletValidation(true);

    if (Object.values(editWalletErrors).some(Boolean)) {
      Object.values(editWalletErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    if (!selectedWallet) return;

    const members = parseMemberEntries(editWalletMembersText);

    const updated = await onUpdateWallet(selectedWallet.wallet.id, {
      name: editWalletName,
      description: editWalletDescription,
      defaultSplitRule: editWalletSplitRule,
      currency: editWalletCurrency,
      pictureUrl: editWalletPictureUrl,
      members,
    });

    if (updated) {
      setIsWalletEditModalOpen(false);
      setShowEditWalletValidation(false);
      setEditWalletPictureUrl(null);
      setEditWalletPictureStats(null);
      setEditPictureError(null);
    }
  }

  async function handleAddWalletMemberSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setShowMemberValidation(true);

    if (Object.values(memberErrors).some(Boolean)) {
      Object.values(memberErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    if (!selectedWallet) {
      return;
    }

    const created = await onAddWalletMember(selectedWallet.wallet.id, {
      displayName: inviteDisplayName,
      email: inviteEmail || undefined,
    });

    if (created) {
      setInviteDisplayName("");
      setInviteEmail("");
      setShowMemberValidation(false);
    }
  }

  async function handleCreateWalletExpenseSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setShowExpenseValidation(true);

    if (Object.values(expenseErrors).some(Boolean)) {
      Object.values(expenseErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    if (!selectedWallet) {
      return;
    }

    const normalizedMemberIds = [
      ...new Set([...selectedSplitMemberIds, expensePayerId].filter(Boolean)),
    ];
    const splits = normalizedMemberIds.map((memberId) => ({
      memberId,
      value:
        expenseSplitRule === "equal"
          ? undefined
          : (splitValues[memberId] ?? ""),
    }));

    const payload = {
      paidByMemberId: expensePayerId,
      amount: expenseAmount,
      category: expenseCategory,
      description: expenseDescription,
      date: expenseDate,
      splitRule: expenseSplitRule,
      splits,
      platform: expensePlatform,
    };

    const created = editingWalletExpenseId
      ? await onUpdateWalletExpense(
          selectedWallet.wallet.id,
          editingWalletExpenseId,
          payload,
        )
      : await onCreateWalletExpense(selectedWallet.wallet.id, payload);

    if (created) {
      // Auto-create settlements for members marked as "already settled" (new expenses only)
      const settledNonPayers = !editingWalletExpenseId
        ? alreadySettledMemberIds.filter(
            (id) => id !== expensePayerId && normalizedMemberIds.includes(id),
          )
        : [];

      if (settledNonPayers.length > 0) {
        const totalAmount = parseFloat(expenseAmount) || 0;

        for (const memberId of settledNonPayers) {
          let shareAmount: string;

          if (expenseSplitRule === "equal") {
            shareAmount = (totalAmount / normalizedMemberIds.length).toFixed(2);
          } else if (expenseSplitRule === "fixed") {
            shareAmount = splitValues[memberId] ?? "0";
          } else {
            const pct = parseFloat(splitValues[memberId] ?? "0");
            shareAmount = ((totalAmount * pct) / 100).toFixed(2);
          }

          if (parseFloat(shareAmount) > 0) {
            await onCreateWalletSettlement(selectedWallet.wallet.id, {
              fromMemberId: memberId,
              toMemberId: expensePayerId,
              amount: shareAmount,
              date: expenseDate,
              note: `Auto-settled: ${expenseDescription}`,
            });
          }
        }
      }

      setExpenseAmount("");
      setExpenseCategory("");
      setExpenseDescription("");
      setExpenseDate(getTodayIsoDate());
      setExpenseSplitRule(selectedWallet.wallet.default_split_rule);
      setSplitValues({});
      setAlreadySettledMemberIds([]);
      setEditingWalletExpenseId(null);
      setExpensePlatform(null);
      setShowExpenseValidation(false);
      setIsMobileExpenseModalOpen(false);
    }
  }

  async function handleCreateSettlementSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setShowSettlementValidation(true);

    if (Object.values(settlementErrors).some(Boolean)) {
      Object.values(settlementErrors).forEach((errorMsg) => {
        if (errorMsg && window.showToast) {
          window.showToast(errorMsg, "error");
        }
      });
      return;
    }

    if (!selectedWallet) {
      return;
    }

    const payload = {
      fromMemberId: settlementFromMemberId,
      toMemberId: settlementToMemberId,
      amount: settlementAmount,
      date: settlementDate,
      note: settlementNote,
    };

    const created = editingSettlementId
      ? await onUpdateWalletSettlement(
          selectedWallet.wallet.id,
          editingSettlementId,
          payload,
        )
      : await onCreateWalletSettlement(selectedWallet.wallet.id, payload);

    if (created) {
      setSettlementAmount("");
      setSettlementDate(getTodayIsoDate());
      setSettlementNote("");
      setEditingSettlementId(null);
      setShowSettlementValidation(false);
      setIsMobileSettlementModalOpen(false);
    }
  }

  function handleWalletBudgetEditStart(budget: BudgetSummary) {
    setEditingWalletBudgetId(budget.id);
    setWalletBudgetForm({
      amount: budget.amount,
      scope: budget.scope,
      category: budget.category ?? "",
      month: budget.month,
    });
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");
    setIsWalletBudgetHistoryOpen(false);
  }

  function handleWalletBudgetEditCancel() {
    setEditingWalletBudgetId(null);
    setWalletBudgetForm({
      ...initialWalletBudgetForm,
      month: getCurrentMonthValue(),
    });
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");
  }

  async function handleWalletBudgetSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedWallet) {
      return;
    }

    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");

    const succeeded = editingWalletBudgetId
      ? await onUpdateWalletBudget(
          selectedWallet.wallet.id,
          editingWalletBudgetId,
          walletBudgetForm,
        )
      : await onCreateWalletBudget(selectedWallet.wallet.id, walletBudgetForm);

    if (!succeeded) {
      setWalletBudgetErrorMessage(
        editingWalletBudgetId
          ? "Failed to update wallet budget."
          : "Failed to save wallet budget.",
      );
      return;
    }

    setEditingWalletBudgetId(null);
    setWalletBudgetForm({
      ...initialWalletBudgetForm,
      month: getCurrentMonthValue(),
    });
    setWalletBudgetStatusMessage(
      editingWalletBudgetId ? "Group budget updated." : "Group budget saved.",
    );
  }

  async function handleWalletBudgetDelete(walletBudgetId: string) {
    if (
      !selectedWallet ||
      !window.confirm("Delete this group budget permanently?")
    ) {
      return;
    }

    setDeletingWalletBudgetIds((current) => [
      ...new Set([...current, walletBudgetId]),
    ]);
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");

    try {
      const deleted = await onDeleteWalletBudget(
        selectedWallet.wallet.id,
        walletBudgetId,
      );

      if (!deleted) {
        setWalletBudgetErrorMessage("Failed to delete wallet budget.");
        return;
      }

      if (editingWalletBudgetId === walletBudgetId) {
        setEditingWalletBudgetId(null);
        setWalletBudgetForm({
          ...initialWalletBudgetForm,
          month: getCurrentMonthValue(),
        });
      }

      setWalletBudgetStatusMessage("Group budget deleted.");
    } finally {
      setDeletingWalletBudgetIds((current) =>
        current.filter((id) => id !== walletBudgetId),
      );
    }
  }

  function handleStartExpenseEdit(walletExpenseId: string) {
    const walletExpense = selectedWallet?.expenses.find(
      (expense) => expense.id === walletExpenseId,
    );

    if (!walletExpense) {
      return;
    }

    setEditingWalletExpenseId(walletExpense.id);
    setExpensePayerId(walletExpense.paid_by_member_id);
    setExpenseAmount(walletExpense.amount);
    setExpenseCategory(walletExpense.category);
    setExpenseDescription(walletExpense.description);
    setExpenseDate(walletExpense.date);
    setExpenseSplitRule(walletExpense.split_rule);
    setSelectedSplitMemberIds(
      walletExpense.splits.map((split) => split.member_id),
    );
    setSplitValues(
      Object.fromEntries(
        walletExpense.splits.map((split) => [
          split.member_id,
          split.percentage === null
            ? split.amount
            : split.percentage.toString(),
        ]),
      ),
    );
    setAlreadySettledMemberIds([]);
    setExpensePlatform(walletExpense.platform ?? null);

    setIsMobileExpenseModalOpen(true);
  }

  function handleDeleteExpenseClick(walletExpenseId: string) {
    const expense = selectedWallet?.expenses.find((e) => e.id === walletExpenseId);
    if (!expense) return;
    setDeleteConfirmation({
      type: "single",
      expenseId: expense.id,
      description: expense.description,
      amount: formatCurrency(expense.amount),
    });
  }

  function handleToggleExpenseSelection(expenseId: string) {
    setSelectedExpenseIds((current) =>
      current.includes(expenseId)
        ? current.filter((id) => id !== expenseId)
        : [...current, expenseId],
    );
  }

  function handleDeleteSelectedExpensesClick() {
    const selectedCount = selectedExpenseIds.length;
    if (selectedCount === 0) return;
    setDeleteConfirmation({
      type: "selected",
      description: `${selectedCount} selected shared ${selectedCount === 1 ? "expense" : "expenses"}`,
    });
  }

  async function handleConfirmDeleteExpense() {
    if (!deleteConfirmation || !selectedWallet) return;
    const { type, expenseId } = deleteConfirmation;
    setDeleteConfirmation(null);

    const idsToDelete = type === "single" && expenseId ? [expenseId] : [...selectedExpenseIds];
    if (idsToDelete.length === 0) return;

    setDeletingExpenseIds((current) => [
      ...new Set([...current, ...idsToDelete]),
    ]);

    try {
      const deleted = await onDeleteWalletExpenses(
        selectedWallet.wallet.id,
        idsToDelete,
      );

      if (deleted) {
        if (expenseId && editingWalletExpenseId === expenseId) {
          setEditingWalletExpenseId(null);
          setAlreadySettledMemberIds([]);
          setExpenseAmount("");
          setExpenseCategory("");
          setExpenseDescription("");
          setExpenseDate(getTodayIsoDate());
          setSplitValues({});
          setExpensePlatform(null);
        }
        setSelectedExpenseIds([]);
      }
    } finally {
      setDeletingExpenseIds((current) =>
        current.filter((id) => !idsToDelete.includes(id)),
      );
    }
  }

  function handleStartSettlementEdit(settlementId: string) {
    const settlement = selectedWallet?.settlements.find(
      (entry) => entry.id === settlementId,
    );

    if (!settlement) {
      return;
    }

    setEditingSettlementId(settlement.id);
    setSettlementFromMemberId(settlement.from_member_id);
    setSettlementToMemberId(settlement.to_member_id);
    setSettlementAmount(settlement.amount);
    setSettlementDate(settlement.date);
    setSettlementNote(settlement.note ?? "");

    if (window.innerWidth < 1536) {
      setIsMobileSettlementModalOpen(true);
    }
  }

  async function handleDeleteSettlementClick(settlementId: string) {
    if (!selectedWallet || !window.confirm("Delete this settlement?")) {
      return;
    }

    setDeletingSettlementIds((current) => [
      ...new Set([...current, settlementId]),
    ]);

    try {
      const deleted = await onDeleteWalletSettlement(
        selectedWallet.wallet.id,
        settlementId,
      );

      if (deleted && editingSettlementId === settlementId) {
        setEditingSettlementId(null);
        setSettlementAmount("");
        setSettlementDate(getTodayIsoDate());
        setSettlementNote("");
      }
    } finally {
      setDeletingSettlementIds((current) =>
        current.filter((id) => id !== settlementId),
      );
    }
  }

  async function handleDeleteWalletClick() {
    if (
      !selectedWallet ||
      !window.confirm(
        `Delete ${selectedWallet.wallet.name} and all its shared data?`,
      )
    ) {
      return;
    }

    setIsDeletingWallet(true);
    try {
      await onDeleteWallet(selectedWallet.wallet.id);
    } finally {
      setIsDeletingWallet(false);
    }
  }

  async function handleLeaveWalletClick() {
    if (
      !selectedWallet ||
      !window.confirm(
        `Exit ${selectedWallet.wallet.name}? You will lose access to this group.`,
      )
    ) {
      return;
    }

    setIsLeavingWallet(true);
    try {
      await onLeaveWallet(selectedWallet.wallet.id);
    } finally {
      setIsLeavingWallet(false);
    }
  }

  function handleOpenCreateLoan(type?: string | unknown) {
    setEditingLoan(null);
    const resolvedType: "lent" | "borrowed" =
      type === "borrowed"
        ? "borrowed"
        : type === "lent"
          ? "lent"
          : (loanTab === "borrowed" ? "borrowed" : "lent");
    setLoanType(resolvedType);
    const nonOwnerMembers = selectedWallet?.members.filter((m) => m.role !== "owner") || [];
    setLoanBorrowerId(nonOwnerMembers[0]?.id || selectedWallet?.members[0]?.id || "");
    setLoanBorrowerName("");
    setLoanBorrowerEmail("");
    setLoanAmount("");
    setLoanInterestRate("0");
    setLoanInterestType("percentage");
    setLoanInterestPeriod("monthly");
    setLoanLendingDate(getTodayIsoDate());
    setLoanInterestStartDate(getTodayIsoDate());
    setLoanDueDate("");
    setLoanNotes("");
    setShowLoanValidation(false);
    setIsLoanModalOpen(true);
  }

  function handleOpenEditLoan(loan: WalletLoan) {
    setEditingLoan(loan);
    setLoanType(loan.loan_type || "lent");
    setLoanBorrowerId(loan.borrower_member_id || "");
    setLoanBorrowerName(loan.borrower_name || "");
    setLoanBorrowerEmail(loan.borrower_email || "");
    setLoanAmount(loan.amount);
    setLoanInterestRate(String(loan.interest_rate ?? 0));
    setLoanInterestType(loan.interest_type ?? "percentage");
    setLoanInterestPeriod(loan.interest_rate_period ?? "monthly");
    setLoanLendingDate(loan.lending_date);
    setLoanInterestStartDate(loan.interest_start_date || "");
    setLoanDueDate(loan.due_date || "");
    setLoanNotes(loan.notes || "");
    setShowLoanValidation(false);
    setIsLoanModalOpen(true);
  }

  function handleOpenEditRepayment(loan: WalletLoan, repayment: WalletLoanRepayment) {
    setEditingRepayment({ loan, repayment });
    setEditRepaymentAmount(repayment.amount);
    setEditRepaymentDate(repayment.repayment_date);
    setEditRepaymentNotes(repayment.notes || "");
    setShowEditRepaymentValidation(false);
  }

  async function handleEditRepaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowEditRepaymentValidation(true);

    if (!editingRepayment) return;
    const amountVal = parseFloat(editRepaymentAmount.trim());
    if (isNaN(amountVal) || amountVal <= 0 || !editRepaymentDate) {
      return;
    }

    const { loan, repayment } = editingRepayment;
    const payload: WalletLoanRepaymentForm = {
      amount: editRepaymentAmount.trim(),
      repaymentDate: editRepaymentDate,
      notes: editRepaymentNotes.trim() || undefined
    };

    let success = false;
    if (loan.wallet_id && onUpdateWalletLoanRepayment) {
      success = await onUpdateWalletLoanRepayment(loan.wallet_id, loan.id, repayment.id, payload);
    } else if (onUpdateStandaloneLoanRepayment) {
      success = await onUpdateStandaloneLoanRepayment(loan.id, repayment.id, payload);
    }

    if (success) {
      setEditingRepayment(null);
      setSelectedLoanForDetails((prev) => {
        if (!prev || prev.id !== loan.id) return prev;
        const updatedRepayments = prev.repayments?.map((r) =>
          r.id === repayment.id
            ? { ...r, amount: payload.amount, repayment_date: payload.repaymentDate, notes: payload.notes || null }
            : r
        );
        return { ...prev, repayments: updatedRepayments };
      });
    }
  }

  async function handleLoanFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowLoanValidation(true);

    if (loanErrors.borrower || loanErrors.amount || loanErrors.interestRate || loanErrors.lendingDate) {
      return;
    }

    const isStandaloneForm = viewMode === "loans" || !selectedWallet || !loanBorrowerId;

    const payload: WalletLoanForm = {
      loanType,
      borrowerMemberId: isStandaloneForm ? undefined : loanBorrowerId,
      borrowerName: isStandaloneForm ? loanBorrowerName.trim() : undefined,
      borrowerEmail: isStandaloneForm ? (loanBorrowerEmail.trim() || undefined) : undefined,
      amount: loanAmount.trim(),
      interestRate: parseFloat(loanInterestRate.trim()) || 0,
      interestType: loanInterestType,
      interestRatePeriod: loanInterestPeriod,
      lendingDate: loanLendingDate,
      interestStartDate: loanInterestStartDate.trim() || undefined,
      dueDate: loanDueDate.trim() || undefined,
      notes: loanNotes.trim() || undefined
    };

    if (editingLoan) {
      if (editingLoan.wallet_id && onUpdateWalletLoan) {
        const success = await onUpdateWalletLoan(editingLoan.wallet_id, editingLoan.id, payload);
        if (success) {
          setIsLoanModalOpen(false);
          setEditingLoan(null);
        }
      } else if (onUpdateStandaloneLoan) {
        const success = await onUpdateStandaloneLoan(editingLoan.id, payload);
        if (success) {
          setIsLoanModalOpen(false);
          setEditingLoan(null);
        }
      }
    } else {
      if (!isStandaloneForm && selectedWallet && onCreateWalletLoan) {
        const success = await onCreateWalletLoan(selectedWallet.wallet.id, payload);
        if (success) {
          setIsLoanModalOpen(false);
        }
      } else if (onCreateStandaloneLoan) {
        const success = await onCreateStandaloneLoan(payload);
        if (success) {
          setIsLoanModalOpen(false);
        }
      }
    }
  }

  async function handleDeleteLoanClick(loan: WalletLoan) {
    if (!window.confirm("Are you sure you want to delete this loan record? All associated repayment history will also be removed.")) {
      return;
    }
    setDeletingLoanIds((prev) => [...prev, loan.id]);
    try {
      if (loan.wallet_id && onDeleteWalletLoan) {
        await onDeleteWalletLoan(loan.wallet_id, loan.id);
      } else if (onDeleteStandaloneLoan) {
        await onDeleteStandaloneLoan(loan.id);
      }
      if (selectedLoanForDetails?.id === loan.id) {
        setSelectedLoanForDetails(null);
      }
    } finally {
      setDeletingLoanIds((prev) => prev.filter((id) => id !== loan.id));
    }
  }

  function handleOpenRepaymentModal(loan: WalletLoan) {
    setActiveLoanForRepayment(loan);
    const { remainingBalance } = calculateLoanFinancials(loan);
    setRepaymentAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
    setRepaymentDate(getTodayIsoDate());
    setRepaymentNotes("");
    setShowRepaymentValidation(false);
    setIsRepaymentModalOpen(true);
  }

  async function handleRepaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowRepaymentValidation(true);

    if (repaymentErrors.amount || repaymentErrors.date) {
      return;
    }

    if (!activeLoanForRepayment) return;

    const payload: WalletLoanRepaymentForm = {
      amount: repaymentAmount.trim(),
      repaymentDate: repaymentDate,
      notes: repaymentNotes.trim() || undefined
    };

    if (activeLoanForRepayment.wallet_id && onCreateWalletLoanRepayment) {
      const success = await onCreateWalletLoanRepayment(activeLoanForRepayment.wallet_id, activeLoanForRepayment.id, payload);
      if (success) {
        setIsRepaymentModalOpen(false);
        setActiveLoanForRepayment(null);
      }
    } else if (onCreateStandaloneLoanRepayment) {
      const success = await onCreateStandaloneLoanRepayment(activeLoanForRepayment.id, payload);
      if (success) {
        setIsRepaymentModalOpen(false);
        setActiveLoanForRepayment(null);
      }
    }
  }

  async function handleDeleteRepaymentClick(loan: WalletLoan, repaymentId: string) {
    if (!window.confirm("Delete this repayment entry?")) return;

    setDeletingLoanRepaymentIds((prev) => [...prev, repaymentId]);
    try {
      if (loan.wallet_id && onDeleteWalletLoanRepayment) {
        await onDeleteWalletLoanRepayment(loan.wallet_id, loan.id, repaymentId);
      } else if (onDeleteStandaloneLoanRepayment) {
        await onDeleteStandaloneLoanRepayment(loan.id, repaymentId);
      }
    } finally {
      setDeletingLoanRepaymentIds((prev) => prev.filter((id) => id !== repaymentId));
    }
  }

  function handleScanComplete(data: { amount: string; description: string; date: string; category?: string; platform?: string }) {
    setExpenseAmount(data.amount);
    setExpenseDescription(data.description);
    setExpenseDate(data.date);
    if (data.platform) {
      setExpensePlatform(data.platform);
    }
    if (data.category) {
      const match = budgetCategoryOptions.find((opt) => opt.label.toLowerCase() === data.category!.toLowerCase());
      if (match) {
        setExpenseCategory(match.label);
      }
    }
  }

  function renderWalletExpenseForm() {
    return (
      <form
        className="grid gap-4"
        onSubmit={handleCreateWalletExpenseSubmit}
        noValidate
      >
        {!editingWalletExpenseId && (
          <details className="group rounded-2xl border border-dashed border-[color:var(--border)] bg-zinc-50/50 p-3">
            <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-primary select-none">
              <span className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Auto-fill from receipt (optional)
              </span>
              <span className="text-xs text-secondary group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="mt-3">
              <ReceiptScanPanel onScanComplete={handleScanComplete} />
            </div>
          </details>
        )}
        <FilterDropdown
          label="Paid by"
          variant="form"
          value={expensePayerId}
          onChange={(val) => setExpensePayerId(val)}
          options={selectedWallet!.members.map((member) => ({
            value: member.id,
            label: member.display_name,
          }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Amount</span>
            <div className="relative">
              <input
                type="number"
                className="pl-8"
                min="0.01"
                step="0.01"
                required
                value={expenseAmount}
                onChange={(event) => setExpenseAmount(event.target.value)}
                aria-invalid={
                  showExpenseValidation && Boolean(expenseErrors.amount)
                }
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 dark:text-zinc-100 z-10">
                {currencySymbol}
              </span>
            </div>
            {showExpenseValidation && expenseErrors.amount ? (
              <span className="text-sm text-[color:var(--danger-text)]">
                {expenseErrors.amount}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Date</span>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              aria-invalid={
                showExpenseValidation && Boolean(expenseErrors.date)
              }
            />
            {showExpenseValidation && expenseErrors.date ? (
              <span className="text-sm text-[color:var(--danger-text)]">
                {expenseErrors.date}
              </span>
            ) : null}
          </label>
        </div>

        <div className="grid gap-1">
          <FilterDropdown
            label="Category"
            variant="form"
            required
            searchable
            value={expenseCategory}
            placeholder="Select a category"
            error={showExpenseValidation && expenseErrors.category ? expenseErrors.category : undefined}
            onChange={(val) => setExpenseCategory(val)}
            options={walletBudgetCategoryChoices.map((option) => ({
              value: option.label,
              label: option.label,
              icon: <CategoryIcon iconId={option.icon} />,
            }))}
          />
        </div>

        <div className="grid gap-3">
          <span className="text-sm font-medium text-secondary">Platform / Source</span>
          <PlatformPicker
            value={expensePlatform}
            onChange={setExpensePlatform}
          />
        </div>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          <span className="required-mark">Description</span>
          <input
            type="text"
            required
            placeholder="Hotel, groceries, tickets"
            value={expenseDescription}
            onChange={(event) => setExpenseDescription(event.target.value)}
            aria-invalid={
              showExpenseValidation && Boolean(expenseErrors.description)
            }
          />
          {showExpenseValidation && expenseErrors.description ? (
            <span className="text-sm text-[color:var(--danger-text)]">
              {expenseErrors.description}
            </span>
          ) : null}
        </label>

        <FilterDropdown
          label="Split rule"
          variant="form"
          value={expenseSplitRule}
          onChange={(val) => setExpenseSplitRule(val as SplitRule)}
          options={[
            { value: "equal", label: "Equal" },
            { value: "fixed", label: "Fixed amounts" },
            { value: "percentage", label: "Percentages" },
          ]}
        />

        <div className="space-y-3 rounded-3xl border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
          <p className="section-eyebrow">Split members</p>
          <div className="grid gap-3">
            {selectedWallet!.members.map((member) => {
              const isSelected = selectedSplitMemberIds.includes(member.id);
              const needsValue = expenseSplitRule !== "equal" && isSelected;
              const canMarkSettled =
                isSelected &&
                member.id !== expensePayerId &&
                !editingWalletExpenseId;
              const isSettled = alreadySettledMemberIds.includes(member.id);

              return (
                <div
                  key={member.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    isSettled
                      ? "border-primary/20 bg-success-tint"
                      : "border-[color:var(--border)] bg-white/85",
                  )}
                >
                  <label className="grid cursor-pointer gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(110px,140px)] sm:items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSplitMember(member.id)}
                    />
                    <span className="text-sm font-semibold text-ink">
                      {member.display_name}
                    </span>
                    {needsValue ? (
                      <div className="relative">
                        <input
                          className={expenseSplitRule === "fixed" ? "pl-8" : ""}
                          value={splitValues[member.id] ?? ""}
                          onChange={(event) =>
                            setSplitValues((current) => ({
                              ...current,
                              [member.id]: event.target.value,
                            }))
                          }
                          placeholder={
                            expenseSplitRule === "fixed" ? "0.00" : "%"
                          }
                        />
                        {expenseSplitRule === "fixed" && (
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold pointer-events-none text-zinc-950 z-10">
                            {currencySymbol}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted">
                        {isSelected ? "Included" : "Excluded"}
                      </span>
                    )}
                  </label>
                  {canMarkSettled ? (
                    <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-[color:var(--border)] pt-3 text-xs font-medium text-secondary">
                      <input
                        type="checkbox"
                        checked={isSettled}
                        onChange={() => handleToggleAlreadySettled(member.id)}
                      />
                      <span className={isSettled ? "text-ink" : "text-muted"}>
                        {isSettled
                          ? "✓ Already settled their share"
                          : "Already settled their share?"}
                      </span>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {editingWalletExpenseId ? (
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => {
                setEditingWalletExpenseId(null);
                setExpensePlatform(null);
                setIsMobileExpenseModalOpen(false);
                setExpenseAmount("");
                setExpenseCategory("");
                setExpenseDescription("");
                setExpenseDate(getTodayIsoDate());
                setSplitValues({});
              }}
            >
              Cancel edit
            </button>
          ) : null}
          <button
            type="submit"
            className="ui-button-primary"
            disabled={isSubmitting}
          >
            {submittingAction === "expense"
              ? "Saving..."
              : editingWalletExpenseId
                ? "Update shared expense"
                : "Add shared expense"}
          </button>
        </div>
      </form>
    );
  }

  function renderSettlementForm() {
    return (
      <form
        className="grid gap-4"
        onSubmit={handleCreateSettlementSubmit}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FilterDropdown
            label="From member"
            variant="form"
            value={settlementFromMemberId}
            onChange={(val) => setSettlementFromMemberId(val)}
            options={selectedWallet!.members.map((member) => ({
              value: member.id,
              label: member.display_name,
            }))}
          />

          <FilterDropdown
            label="To member"
            variant="form"
            value={settlementToMemberId}
            onChange={(val) => setSettlementToMemberId(val)}
            options={selectedWallet!.members.map((member) => ({
              value: member.id,
              label: member.display_name,
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Amount</span>
            <div className="relative">
              <input
                className="pl-8"
                value={settlementAmount}
                onChange={(event) => setSettlementAmount(event.target.value)}
                placeholder="0.00"
                required
                aria-invalid={
                  showSettlementValidation && Boolean(settlementErrors.amount)
                }
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 z-10">
                {currencySymbol}
              </span>
            </div>
            {showSettlementValidation && settlementErrors.amount ? (
              <span className="text-sm text-[color:var(--danger-text)]">
                {settlementErrors.amount}
              </span>
            ) : null}
          </label>
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Date</span>
            <input
              type="date"
              value={settlementDate}
              onChange={(event) => setSettlementDate(event.target.value)}
              required
              aria-invalid={
                showSettlementValidation && Boolean(settlementErrors.date)
              }
            />
            {showSettlementValidation && settlementErrors.date ? (
              <span className="text-sm text-[color:var(--danger-text)]">
                {settlementErrors.date}
              </span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          Note
          <input
            value={settlementNote}
            onChange={(event) => setSettlementNote(event.target.value)}
            placeholder="Optional note"
          />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {editingSettlementId ? (
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => {
                setEditingSettlementId(null);
                setIsMobileSettlementModalOpen(false);
              }}
            >
              Cancel edit
            </button>
          ) : null}
          <button
            type="submit"
            className="ui-button-primary"
            disabled={isSubmitting}
          >
            {submittingAction === "settlement"
              ? "Saving..."
              : editingSettlementId
                ? "Update settlement"
                : "Record settlement"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <PageHero
        eyebrow={viewMode === "wallets" ? "Shared wallets" : "Peer Lending & Loans"}
        title={viewMode === "wallets" ? "Track group spending, balances, and settlements." : "Track loans, custom interest, and repayments directly."}
        description={viewMode === "wallets"
          ? "Create a wallet for a trip, home, or shared budget, then manage balances, group budgets, transactions, invites, and payback history in one connected surface."
          : "Lend money with customizable monthly, yearly, or one-time interest schedules and start dates. Track principal, accrued interest, and repayments without needing a group wallet."}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2 border-b border-[color:var(--border)] mb-6">
        <div className="inline-flex p-1 rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/80 border border-[color:var(--border)] shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode("wallets")}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
              viewMode === "wallets"
                ? "bg-white dark:bg-zinc-900 text-ink shadow-sm scale-[1.01]"
                : "text-secondary hover:text-ink"
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-primary">
              <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3.5 15.5a3.5 3.5 0 0 1 7 0h-7ZM13.5 15.5a3.5 3.5 0 0 1 7 0h-7Z" />
            </svg>
            <span>Shared Wallets</span>
            {wallets.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200">
                {wallets.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("loans");
              void onLoadLoans?.();
            }}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
              viewMode === "loans"
                ? "bg-white dark:bg-zinc-900 text-ink shadow-sm scale-[1.01]"
                : "text-secondary hover:text-ink"
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-emerald-500">
              <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-3 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
            </svg>
            <span>Peer Loans &amp; Lending</span>
            {standaloneLoansList.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                {standaloneLoansList.length}
              </span>
            )}
          </button>
        </div>

        {/* {viewMode === "loans" && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {standaloneLoansList.length > 0 && (
              <button
                type="button"
                className="ui-button-secondary flex items-center gap-2 shadow-xs cursor-pointer"
                onClick={() => handleOpenBorrowerStatement(null)}
                title="View consolidated monthly statement for borrowers"
              >
                <span>📄 Mini Statement</span>
              </button>
            )}
            <button
              type="button"
              className="ui-button-primary flex items-center gap-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={handleOpenCreateLoan}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              <span>Lend Money</span>
            </button>
          </div>
        )} */}
      </div>

      {statusMessage ? (
        <StatusNotice tone="success">{statusMessage}</StatusNotice>
      ) : null}
      {errorMessage ? (
        <StatusNotice tone="error">{errorMessage}</StatusNotice>
      ) : null}

      {viewMode === "loans" && !isLoansLoading && myOverdueLoans.length > 0 && !isDismissedOverdueAlert && (
        <div className="mb-6 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 p-4 sm:p-5 shadow-sm transition-all">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200 text-sm font-bold">
                  ⚠️
                </span>
                <h3 className="text-base font-bold text-rose-900 dark:text-rose-100">
                  Payment Overdue Alert ({myOverdueLoans.length} {myOverdueLoans.length === 1 ? "Loan" : "Loans"})
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-200/80 text-rose-800 dark:bg-rose-900 dark:text-rose-300">
                  Action Required
                </span>
              </div>
              <p className="text-sm text-rose-800 dark:text-rose-200">
                You have passed the due date on {myOverdueLoans.length} borrowed loan{myOverdueLoans.length === 1 ? "" : "s"}. Total overdue balance:{" "}
                <span className="font-bold text-rose-950 dark:text-white">
                  {formatCurrency(myOverdueLoans.reduce((sum, l) => sum + calculateLoanFinancials(l).remainingBalance, 0).toFixed(2))}
                </span>
                . Please review your mini statement or settle payments with the lender.
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {myOverdueLoans.map((ovLoan) => {
                  const fin = calculateLoanFinancials(ovLoan);
                  return (
                    <div
                      key={ovLoan.id}
                      className="flex items-center gap-2 rounded-xl bg-white/95 dark:bg-zinc-900/90 border border-rose-200 dark:border-rose-900/60 px-3 py-1.5 text-xs text-secondary shadow-xs"
                    >
                      <span className="font-semibold text-ink">
                        {ovLoan.borrower_name || "Loan"}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        Due: {ovLoan.due_date}
                      </span>
                      <span className="font-bold text-rose-700 dark:text-rose-300">
                        {formatCurrency(fin.remainingBalance.toFixed(2), selectedWallet?.wallet?.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                className="ui-button-secondary !bg-white dark:!bg-zinc-900 text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                onClick={() => {
                  const firstBorrowerKey = myOverdueLoans[0]?.borrower_member_id || myOverdueLoans[0]?.borrower_email || myOverdueLoans[0]?.borrower_name || null;
                  handleOpenBorrowerStatement(firstBorrowerKey);
                }}
              >
                <span>📄 View Mini Statement</span>
              </button>
              <button
                type="button"
                className="text-xs text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-white px-2 py-1 font-medium transition-colors cursor-pointer"
                onClick={() => setIsDismissedOverdueAlert(true)}
                title="Dismiss alert banner for this session"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === "wallets" && (
        <div className="space-y-6">
          {/* Top Active Shared Wallet Banner */}
          {displayWallet && (
            <SurfaceCard className="relative overflow-hidden border-primary/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(246,249,247,0.9))] p-5 sm:p-6 shadow-[0_16px_40px_rgba(30,122,83,0.08)] backdrop-blur-xl">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                {/* Left side: Avatar + Details */}
                <div className="flex flex-col gap-3.5 sm:gap-4 min-w-0 flex-1">
                  {/* Group Avatar and Name & Description aligned side-by-side */}
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                    {displayWallet.picture_url ? (
                      <img
                        src={displayWallet.picture_url}
                        alt={displayWallet.name}
                        className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-2 ring-primary/20 shadow-md shrink-0"
                      />
                    ) : (
                      <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-2xl sm:text-3xl font-bold font-display text-white shadow-md">
                        {displayWallet.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold font-display text-ink tracking-tight truncate">
                        {displayWallet.name}
                      </h2>

                      <p className="text-sm text-secondary line-clamp-2 mt-0.5 sm:mt-1">
                        {displayWallet.description || "No description provided for this group yet."}
                      </p>
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isSwitchingWallet ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        Loading wallet...
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                          Active Shared Wallet
                        </span>
                        <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-2.5 py-0.5 text-xs font-medium text-secondary">
                          {isWalletOwner ? "👑 Group Owner" : "Member"}
                        </span>
                      </>
                    )}
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-ink">
                      {displayWallet.currency || "INR"}
                    </span>
                    <span className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-ink capitalize">
                      {displayWallet.default_split_rule} split by default
                    </span>
                  </div>

                    {/* Member Initials Chips Row */}
                    {isSwitchingWallet ? (
                      <div className="mt-3.5 flex items-center gap-2 text-xs font-medium text-secondary">
                        <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                        <span className="text-muted">Downloading members &amp; balances...</span>
                      </div>
                    ) : selectedWallet ? (
                      <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary pr-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-primary shrink-0">
                            <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
                          </svg>
                          <span>Members:</span>
                        </div>

                        {/* Chips only: initials badge & owner crown icon with full details in hover tooltip */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {selectedWallet.members.map((member) => {
                            const initials = getMemberInitials(member.display_name);
                            const gradient = getMemberGradient(member.display_name);
                            const isOwner = member.role === "owner";
                            return (
                              <span
                                key={member.id}
                                title={`${member.display_name} • ${isOwner ? "👑 Group Owner" : "Member"}${member.email ? ` (${member.email})` : ""}`}
                                className="relative inline-flex items-center gap-1 rounded-full border border-primary/25 bg-white/95 dark:bg-zinc-800/90 py-0.5 px-2 text-xs font-bold text-ink shadow-xs backdrop-blur-xs transition-transform hover:scale-110 cursor-help"
                              >
                                <span
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white shadow-2xs"
                                  style={{ background: gradient }}
                                >
                                  {initials}
                                </span>
                                {isOwner && (
                                  <span className="text-amber-500 text-2xs -ml-0.5" title="Group Owner">👑</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                {/* Right side: Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
                  {!isSwitchingWallet && selectedWallet && (
                    <>
                      {isWalletOwner ? (
                        <>
                          <button
                            type="button"
                            className="ui-button-secondary text-xs sm:text-sm"
                            onClick={handleStartWalletEdit}
                          >
                            Edit group
                          </button>
                          <button
                            type="button"
                            className="ui-button-danger text-xs sm:text-sm"
                            onClick={() => void handleDeleteWalletClick()}
                            disabled={isSubmitting || isDeletingWallet}
                          >
                            {isDeletingWallet ? "Deleting..." : "Delete group"}
                          </button>
                        </>
                      ) : currentWalletMember ? (
                        <button
                          type="button"
                          className="ui-button-danger text-xs sm:text-sm"
                          onClick={() => void handleLeaveWalletClick()}
                          disabled={isSubmitting || isLeavingWallet}
                        >
                          {isLeavingWallet ? "Leaving..." : "Exit group"}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {/* Wallet quick switcher if multiple wallets exist */}
              {wallets.length > 1 && (
                <div className="mt-4 pt-3.5 border-t border-[color:var(--border)] flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs font-semibold text-muted shrink-0">Switch:</span>
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onSelectWallet(w.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer",
                        w.id === selectedWalletId
                          ? "bg-primary text-white shadow-xs font-semibold"
                          : "bg-white/80 dark:bg-zinc-800 text-secondary border border-[color:var(--border)] hover:bg-white hover:text-ink"
                      )}
                    >
                      {w.picture_url ? (
                        <img src={w.picture_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-2xs font-bold text-primary">
                          {w.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span>{w.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCreateWalletModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer"
                  >
                    + New
                  </button>
                </div>
              )}
            </SurfaceCard>
          )}

          <section className="grid gap-5 xl:grid-cols-[minmax(280px,0.34fr)_minmax(0,0.66fr)]">
            <SurfaceCard className="space-y-4 p-5 sm:p-6 xl:sticky xl:top-32 xl:self-start">
              <SectionHeader
                eyebrow="Your wallets"
                title="Groups & Ledgers"
                description="Switch between wallets or create a new group."
                actions={
                  <button
                    type="button"
                    onClick={() => setIsCreateWalletModalOpen(true)}
                    className="ui-button-primary !min-h-9 !px-3.5 !py-1.5 text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span className="text-sm font-bold leading-none">+</span>
                    <span>New Wallet</span>
                  </button>
                }
              />

              {wallets.length === 0 ? (
                <EmptyState
                  title="No wallets yet"
                  description="Create your first shared wallet to start tracking group spending, shared budgets, and settlements."
                  action={
                    <button
                      type="button"
                      onClick={() => setIsCreateWalletModalOpen(true)}
                      className="ui-button-primary mt-2 cursor-pointer"
                    >
                      Create Shared Wallet
                    </button>
                  }
                />
              ) : (
                <div className="grid gap-2.5">
                  {wallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      type="button"
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-3.5 text-left shadow-sm transition-all duration-200 cursor-pointer",
                        wallet.id === selectedWalletId
                          ? "border-primary/35 bg-success-tint/70 text-ink ring-1 ring-primary/20 shadow-xs"
                          : "border-[color:var(--border)] bg-white/80 text-secondary hover:bg-white hover:border-primary/25",
                      )}
                      onClick={() => onSelectWallet(wallet.id)}
                    >
                      {wallet.picture_url ? (
                        <img
                          src={wallet.picture_url}
                          alt={wallet.name}
                          className="h-11 w-11 rounded-2xl object-cover ring-1 ring-black/10 shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-sm font-bold text-white shadow-xs mt-0.5">
                          {wallet.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <strong className="truncate block text-sm font-bold text-ink">
                            {wallet.name}
                          </strong>
                          <span className="text-2xs font-semibold text-primary shrink-0">
                            {wallet.currency || "INR"}
                          </span>
                        </div>
                        <span className="mt-0.5 block text-xs line-clamp-1 text-secondary">
                          {wallet.description || "No description"}
                        </span>
                        <div className="mt-2 flex items-center gap-1.5 text-2xs font-semibold text-muted">
                          <span className="capitalize">{wallet.default_split_rule} split</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SurfaceCard>

            <section className="grid gap-5">
              {isSwitchingWallet ? (
                <div className="space-y-5">
                  <SurfaceCard className="relative overflow-hidden border-primary/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[340px] shadow-sm bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(246,249,247,0.85))] dark:bg-zinc-900/90">
                    <div className="relative flex items-center justify-center mb-4">
                      <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                      <span className="absolute text-xl">👛</span>
                    </div>
                    <h3 className="text-xl font-bold font-display text-ink tracking-tight">
                      Loading {displayWallet?.name ? `"${displayWallet.name}"` : "shared wallet"}...
                    </h3>
                    <p className="mt-1.5 text-sm text-secondary max-w-md">
                      Downloading members roster, shared expenses, balances, budgets, and settlement history.
                    </p>
                    <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-3.5 py-1.5 rounded-full">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      Syncing shared ledger
                    </div>
                  </SurfaceCard>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <SurfaceCard className="p-5 space-y-3 animate-pulse border-[color:var(--border)]">
                      <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                      <div className="h-8 w-44 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                      <div className="h-3 w-36 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
                    </SurfaceCard>
                    <SurfaceCard className="p-5 space-y-3 animate-pulse border-[color:var(--border)]">
                      <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                      <div className="h-8 w-40 bg-zinc-200 dark:bg-zinc-700 rounded-md" />
                      <div className="h-3 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
                    </SurfaceCard>
                  </div>
                </div>
              ) : !selectedWallet ? (
                <EmptyState
                  title="Select a wallet"
                  description="Choose a wallet to view members, balances, shared expenses, settlements, and wallet-specific budgets."
                />
              ) : (
                <>
                  {/* Sub-tab Navigation & Quick Action Controls (Issues #6, #7) */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[color:var(--border)] bg-white/80 p-3 shadow-sm">
                    <div role="tablist" aria-label="Wallet sections" className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        role="tab"
                        id="tab-overview"
                        aria-selected={walletSubTab === "overview"}
                        aria-controls="panel-overview"
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                          walletSubTab === "overview"
                            ? "bg-primary text-white shadow-xs"
                            : "text-secondary hover:bg-zinc-100 hover:text-ink",
                        )}
                        onClick={() => setWalletSubTab("overview")}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="tab-transactions"
                        aria-selected={walletSubTab === "transactions"}
                        aria-controls="panel-transactions"
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                          walletSubTab === "transactions"
                            ? "bg-primary text-white shadow-xs"
                            : "text-secondary hover:bg-zinc-100 hover:text-ink",
                        )}
                        onClick={() => setWalletSubTab("transactions")}
                      >
                        Transactions & Forms
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="tab-budget"
                        aria-selected={walletSubTab === "budget"}
                        aria-controls="panel-budget"
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                          walletSubTab === "budget"
                            ? "bg-primary text-white shadow-xs"
                            : "text-secondary hover:bg-zinc-100 hover:text-ink",
                        )}
                        onClick={() => setWalletSubTab("budget")}
                      >
                        Budget
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="tab-members"
                        aria-selected={walletSubTab === "members"}
                        aria-controls="panel-members"
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                          walletSubTab === "members"
                            ? "bg-primary text-white shadow-xs"
                            : "text-secondary hover:bg-zinc-100 hover:text-ink",
                        )}
                        onClick={() => setWalletSubTab("members")}
                      >
                        Members & Roles
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="tab-all"
                        aria-selected={walletSubTab === "all"}
                        aria-controls="panel-all"
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                          walletSubTab === "all"
                            ? "bg-primary text-white shadow-xs"
                            : "text-secondary hover:bg-zinc-100 hover:text-ink",
                        )}
                        onClick={() => setWalletSubTab("all")}
                      >
                        All
                      </button>
                    </div>

                    {/* Quick action buttons (Issue #7: Quick shortcut to transaction forms) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="ui-button-primary ui-button-sm text-xs cursor-pointer"
                        onClick={() => {
                          setWalletSubTab("transactions");
                          setTimeout(() => {
                            document.getElementById("wallet-transaction-forms")?.scrollIntoView({ behavior: "smooth" });
                          }, 50);
                        }}
                      >
                        ＋ Add Transaction
                      </button>
                      <button
                        type="button"
                        className="ui-button-secondary ui-button-sm text-xs cursor-pointer"
                        onClick={() => {
                          setWalletSubTab("transactions");
                          setTimeout(() => {
                            document.getElementById("wallet-payback-form")?.scrollIntoView({ behavior: "smooth" });
                          }, 50);
                        }}
                      >
                        Record Payback
                      </button>
                    </div>
                  </div>

                  {/* Section 1: Balances */}
                  {(walletSubTab === "overview" || walletSubTab === "all") && (
                    <SurfaceCard className="space-y-5 p-5 sm:p-6">
                      <SectionHeader
                        eyebrow="Balances"
                        title="Who should receive and who owes"
                        description="Live net balances keep the group aware of who is owed and who still needs to settle."
                      />
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {selectedWallet.balances.map((balance) => {
                          const numericBalance = Number(balance.net_amount);

                          return (
                            <article
                              key={balance.member_id}
                              className={cn(
                                "rounded-2xl border p-5 shadow-sm",
                                numericBalance > 0
                                  ? "border-primary/12 bg-success-tint"
                                  : numericBalance < 0
                                    ? "border-[color:rgba(154,63,56,0.14)] bg-danger-tint"
                                    : "border-[color:var(--border)] bg-white/80",
                              )}
                            >
                              <strong className="block text-lg text-ink">
                                {balance.member_name}
                              </strong>
                              <span className="mt-2 block text-sm text-secondary">
                                {numericBalance > 0
                                  ? "Should receive"
                                  : numericBalance < 0
                                    ? "Needs to settle"
                                    : "Square"}
                              </span>
                              <h3 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink">
                                {formatCurrency(Math.abs(numericBalance).toFixed(2), selectedWallet.wallet.currency)}
                              </h3>
                            </article>
                          );
                        })}
                      </div>
                    </SurfaceCard>
                  )}

                  {/* Section 2: Shared expense & Settlement forms (vertically stacked) */}
                  {(walletSubTab === "overview" || walletSubTab === "transactions" || walletSubTab === "all") && (
                    <section id="wallet-transaction-forms" className="space-y-5">
                      <SurfaceCard className="space-y-5 p-5 sm:p-6">
                        <SectionHeader
                          eyebrow="Shared expense"
                          title={
                            editingWalletExpenseId
                              ? "Edit group transaction"
                              : "Add a group transaction"
                          }
                          description="Capture a shared purchase, choose the payer, and define how the split should be distributed across members."
                        />
                        {renderWalletExpenseForm()}
                      </SurfaceCard>

                      <SurfaceCard id="wallet-payback-form" className="space-y-5 p-5 sm:p-6">
                        <SectionHeader
                          eyebrow="Settlement"
                          title={
                            editingSettlementId ? "Edit payback" : "Record a payback"
                          }
                          description="Log repayments to keep group balances current and the shared ledger easy to reconcile."
                          actions={
                            <button
                              type="button"
                              className="ui-button-secondary ui-button-sm text-xs cursor-pointer"
                              onClick={() => setIsSettlementModalOpen(true)}
                            >
                              Payback history
                            </button>
                          }
                        />
                        {renderSettlementForm()}
                      </SurfaceCard>
                    </section>
                  )}

                  {/* Section 3: Recent group activity */}
                  {(walletSubTab === "overview" || walletSubTab === "transactions" || walletSubTab === "all") && (
                    <SurfaceCard className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  eyebrow="Shared expenses"
                  title="Recent group activity"
                  description="The latest shared purchases inside this wallet."
                  actions={
                    <button
                      type="button"
                      className="ui-button-secondary"
                      onClick={() => setIsExpenseModalOpen(true)}
                    >
                      Filter expenses
                    </button>
                  }
                />
                {activeExpenseFilters.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-zinc-50/75 px-4 py-3">
                    <p className="text-sm text-secondary">
                      Showing: {activeExpenseFilters.join(" • ")}
                    </p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary hover:underline"
                      onClick={() => {
                        setExpenseFilterMonth("all");
                        setExpenseFilterCategory("all");
                        setExpenseFilterAmount("all");
                        setExpenseFilterPlatform("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : null}
                {selectedWallet.expensePagination && selectedWallet.expensePagination.total > selectedWallet.expenses.length ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 font-medium">
                    Showing only the latest {selectedWallet.expenses.length} of {selectedWallet.expensePagination.total} expenses. Please load more to see older data.
                  </div>
                ) : null}
                {selectedWallet.expenses.length === 0 ? (
                  <EmptyState
                    title="No shared expenses yet"
                    description="Add the first group transaction to start tracking how this wallet is being used."
                  />
                ) : filteredExpenses.length === 0 ? (
                  selectedWallet.expensePagination?.hasMore ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[color:var(--border)] bg-zinc-50/50 p-8 text-center sm:p-12">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-ink">No matches in loaded data</h3>
                      <p className="mt-2 max-w-sm text-sm text-secondary">
                        None of the currently loaded {selectedWallet.expenses.length} expenses match these filters. You can load older data to search further back.
                      </p>
                      <button
                        type="button"
                        className="ui-button-secondary mt-6 flex items-center gap-2"
                        onClick={onLoadMoreExpenses}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading older history..." : "Load older history"}
                      </button>
                    </div>
                  ) : (
                    <EmptyState
                      title="No expenses match the current filters"
                      description="Adjust the platform, category, or date filters to find what you're looking for."
                    />
                  )
                ) : (
                  <>
                    {filteredExpenses.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-zinc-50/75 px-4 py-3 mb-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            aria-label="Select all filtered group expenses"
                            checked={filteredExpenses.length > 0 && filteredExpenses.every((e) => selectedExpenseIds.includes(e.id))}
                            onChange={() => {
                              const allSelected = filteredExpenses.every((e) => selectedExpenseIds.includes(e.id));
                              if (allSelected) {
                                setSelectedExpenseIds((current) =>
                                  current.filter((id) => !filteredExpenses.some((e) => e.id === id)),
                                );
                              } else {
                                setSelectedExpenseIds((current) => [
                                  ...new Set([...current, ...filteredExpenses.map((e) => e.id)]),
                                ]);
                              }
                            }}
                          />
                          <span className="text-sm font-semibold text-ink">Select All</span>
                          <span className="text-sm text-secondary">
                            {selectedExpenseIds.length > 0 ? `(${selectedExpenseIds.length} selected)` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedExpenseIds.length > 0 ? (
                            <button
                              type="button"
                              className="ui-button-danger ui-button-sm"
                              disabled={selectedExpenseIds.some((id) => deletingExpenseIds.includes(id))}
                              onClick={handleDeleteSelectedExpensesClick}
                            >
                              {selectedExpenseIds.some((id) => deletingExpenseIds.includes(id)) ? "Deleting..." : "Delete selected"}
                            </button>
                          ) : null}

                          {(() => {
                            const isLoadMoreMode = Boolean(selectedWallet.expensePagination?.hasMore && currentWalletExpensesPage === totalWalletExpensePages);
                            const showPagination = totalWalletExpensePages > 1 || Boolean(selectedWallet.expensePagination?.hasMore);

                            if (!showPagination) return null;

                            return (
                              <div className="flex items-center gap-1 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                                <button
                                  type="button"
                                  className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[70px]"
                                  disabled={currentWalletExpensesPage === 1 || isLoading}
                                  onClick={() =>
                                    setCurrentWalletExpensesPage(
                                      currentWalletExpensesPage - 1,
                                    )
                                  }
                                  title="Previous Page"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:mr-1">
                                    <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                                  </svg>
                                  <span className="hidden sm:inline">Prev</span>
                                </button>
                                <span className="text-xs font-semibold text-secondary px-1 text-center min-w-[40px] sm:min-w-[50px]">
                                  {currentWalletExpensesPage}/{totalWalletExpensePages}
                                </span>
                                <button
                                  type="button"
                                  className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[80px]"
                                  disabled={isLoading || isLoadingMoreExpenses || (!isLoadMoreMode && currentWalletExpensesPage === totalWalletExpensePages)}
                                  onClick={async () => {
                                    if (isLoadMoreMode) {
                                      if (onLoadMoreExpenses) {
                                        try {
                                          await onLoadMoreExpenses();
                                          setCurrentWalletExpensesPage(currentWalletExpensesPage + 1);
                                        } catch (err) {}
                                      }
                                    } else {
                                      setCurrentWalletExpensesPage(currentWalletExpensesPage + 1);
                                    }
                                  }}
                                  title={isLoadMoreMode ? "Load More Expenses" : "Next Page"}
                                >
                                  {isLoadMoreMode ? (
                                    (isLoading || isLoadingMoreExpenses) ? (
                                      <>
                                        <span className="hidden sm:inline">Loading...</span>
                                        <span className="inline sm:hidden">...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="hidden sm:inline">Load More</span>
                                        <span className="inline sm:hidden">Load</span>
                                      </>
                                    )
                                  ) : (
                                    <>
                                      <span className="hidden sm:inline">Next</span>
                                    </>
                                  )}
                                  {!(isLoading || isLoadingMoreExpenses) && (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:ml-1">
                                      {isLoadMoreMode ? (
                                        <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.63l3.72-3.72a.75.75 0 1 1 1.06 1.06l-5 5a.75.75 0 0 1-1.06 0l-5-5a.75.75 0 1 1 1.06-1.06l3.72 3.72V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                                      ) : (
                                        <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                      )}
                                    </svg>
                                  )}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ) : null}
                    {/* Desktop View */}
                    <div className="hidden lg:grid lg:gap-3">
                      {paginatedWalletExpenses.map((expense) => (
                        <article
                          key={expense.id}
                          className={cn(
                            "group rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md",
                            selectedExpenseIds.includes(expense.id)
                              ? "border-primary/25 bg-success-tint"
                              : "border-[color:var(--border)] bg-white/80",
                            deletingExpenseIds.includes(expense.id) && "animate-delete",
                          )}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                aria-label={`Select ${expense.description}`}
                                checked={selectedExpenseIds.includes(expense.id)}
                                disabled={deletingExpenseIds.includes(expense.id)}
                                onChange={() => handleToggleExpenseSelection(expense.id)}
                                className="mr-1"
                              />
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success-tint/60 text-ink shadow-sm">
                                <CategoryIcon
                                  iconId={
                                    budgetCategoryOptions.find(
                                      (option) => option.label === expense.category,
                                    )?.icon ?? "other"
                                  }
                                />
                              </span>
                              {expense.platform ? (
                                <PlatformPicker value={expense.platform} onChange={null} className="shrink-0 self-center" />
                              ) : null}
                              <div className="min-w-0 space-y-1">
                                <strong className="block text-base font-semibold text-ink truncate">
                                  {expense.description}
                                </strong>
                                <p className="text-xs text-secondary leading-none">
                                  {expense.category} · paid by <span className="font-medium text-ink">{expense.paid_by_member_name?.split(" ")[0]}</span> · {expense.date}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3.5 shrink-0 justify-between lg:justify-end">
                              <div className="text-left lg:text-right">
                                <strong className="block text-lg sm:text-xl font-bold tracking-tight text-ink">
                                  {formatCurrency(expense.amount, selectedWallet?.wallet.currency)}
                                </strong>
                                <span className="text-xs font-medium text-secondary">
                                  {expense.split_rule} split
                                </span>
                              </div>
                              <div className="pl-2 border-l border-[color:var(--border)]/60">
                                <ItemActionButtons
                                  description={expense.description}
                                  isDeleting={deletingExpenseIds.includes(expense.id)}
                                  onEdit={() => handleStartExpenseEdit(expense.id)}
                                  onDelete={() => void handleDeleteExpenseClick(expense.id)}
                                />
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>

                    {/* Mobile View */}
                    <div className="grid gap-3 lg:hidden">
                      {paginatedWalletExpenses.map((expense) => (
                        <article
                          key={expense.id}
                          className={cn(
                            "table-card-mobile space-y-4 transition-all duration-200",
                            selectedExpenseIds.includes(expense.id)
                              ? "border-primary/25 bg-success-tint"
                              : "border-[color:var(--border)] bg-white/80",
                            deletingExpenseIds.includes(expense.id) && "animate-delete",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                aria-label={`Select ${expense.description}`}
                                checked={selectedExpenseIds.includes(expense.id)}
                                disabled={deletingExpenseIds.includes(expense.id)}
                                onChange={() => handleToggleExpenseSelection(expense.id)}
                              />
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success-tint text-ink shadow-sm">
                                <CategoryIcon
                                  iconId={
                                    budgetCategoryOptions.find(
                                      (option) => option.label === expense.category,
                                    )?.icon ?? "other"
                                  }
                                />
                              </span>
                              {expense.platform ? (
                                <PlatformPicker value={expense.platform} onChange={null} className="shrink-0 self-center" />
                              ) : null}
                            </div>
                            <strong className="text-xl text-ink">{formatCurrency(expense.amount, selectedWallet?.wallet.currency)}</strong>
                          </div>

                          <div className="space-y-1">
                            <strong className="block text-base font-semibold text-ink">{expense.description}</strong>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800/60 pt-2.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                              <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.15em] text-secondary">{expense.category}</span>
                              <span>paid by <span className="font-medium text-ink">{expense.paid_by_member_name?.split(" ")[0]}</span></span>
                              <span>•</span>
                              <span>{expense.date}</span>
                              <span>•</span>
                              <span className="text-xs font-medium text-secondary">
                                {expense.split_rule} split
                              </span>
                            </div>
                            <ItemActionButtons
                              description={expense.description}
                              isDeleting={deletingExpenseIds.includes(expense.id)}
                              onEdit={() => handleStartExpenseEdit(expense.id)}
                              onDelete={() => void handleDeleteExpenseClick(expense.id)}
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                    {(() => {
                      const isLoadMoreMode = Boolean(selectedWallet.expensePagination?.hasMore && currentWalletExpensesPage === totalWalletExpensePages);
                      const showPagination = totalWalletExpensePages > 1 || Boolean(selectedWallet.expensePagination?.hasMore);

                      if (!showPagination) return null;

                      return (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-white/75 px-4 py-4">
                          <p className="text-sm text-secondary">
                            Page {currentWalletExpensesPage} of {totalWalletExpensePages}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[70px]"
                              disabled={currentWalletExpensesPage === 1 || isLoading}
                              onClick={() =>
                                setCurrentWalletExpensesPage(
                                  currentWalletExpensesPage - 1,
                                )
                              }
                              title="Previous Page"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:mr-1">
                                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                              </svg>
                              <span className="hidden sm:inline">Previous</span>
                            </button>
                            <button
                              type="button"
                              className="ui-button-secondary ui-button-sm flex items-center justify-center min-w-[32px] sm:min-w-[80px]"
                              disabled={isLoading || isLoadingMoreExpenses || (!isLoadMoreMode && currentWalletExpensesPage === totalWalletExpensePages)}
                              onClick={async () => {
                                if (isLoadMoreMode) {
                                  if (onLoadMoreExpenses) {
                                    try {
                                      await onLoadMoreExpenses();
                                      setCurrentWalletExpensesPage(currentWalletExpensesPage + 1);
                                    } catch (err) {
                                      // Do not navigate to next page if request failed
                                    }
                                  }
                                } else {
                                  setCurrentWalletExpensesPage(currentWalletExpensesPage + 1);
                                }
                              }}
                              title={isLoadMoreMode ? "Load More Expenses" : "Next Page"}
                            >
                              {isLoadMoreMode ? (
                                (isLoading || isLoadingMoreExpenses) ? (
                                  <>
                                    <span className="hidden sm:inline">Loading...</span>
                                    <span className="inline sm:hidden">...</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="hidden sm:inline">Load More</span>
                                    <span className="inline sm:hidden">Load</span>
                                  </>
                                )
                              ) : (
                                <>
                                  <span className="hidden sm:inline">Next</span>
                                </>
                              )}
                              {!(isLoading || isLoadingMoreExpenses) && (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:ml-1">
                                  {isLoadMoreMode ? (
                                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.63l3.72-3.72a.75.75 0 1 1 1.06 1.06l-5 5a.75.75 0 0 1-1.06 0l-5-5a.75.75 0 1 1 1.06-1.06l3.72 3.72V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                                  ) : (
                                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                  )}
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) }
              </SurfaceCard>
            )}

            {(walletSubTab === "budget" || walletSubTab === "all") && (
              <BudgetTrackerSection
                sectionTitle="Group budget tracking"
                sectionDescription={`Monitor how much room is left in ${currentWalletBudgetMonthLabel} across this wallet's overall and category caps.`}
                currentBudgetMonthLabel={currentWalletBudgetMonthLabel}
                currentMonthBudgetSummaries={currentMonthWalletBudgetSummaries}
                currentMonthBudgetOverview={currentMonthWalletBudgetOverview}
                budgetForm={walletBudgetForm}
                budgetCategoryOptions={walletBudgetCategoryChoices}
                editingBudgetId={editingWalletBudgetId}
                deletingBudgetIds={deletingWalletBudgetIds}
                isBudgetLoading={isLoading}
                isBudgetSubmitting={submittingAction === "budget"}
                budgetStatusMessage={walletBudgetStatusMessage}
                budgetErrorMessage={walletBudgetErrorMessage}
                budgetHistoryGroups={walletBudgetHistoryGroups}
                budgetHistoryRange={walletBudgetHistoryRange}
                isBudgetHistoryOpen={isWalletBudgetHistoryOpen}
                currencySymbol={currencySymbol}
                emptyStateMessage={`No group budgets set for ${currentWalletBudgetMonthLabel} yet. Add one to start tracking shared spend.`}
                formDescription="Create monthly caps or category-specific targets for this wallet and update them as the plan changes."
                historyDialogTitle="Group budget history"
                historyDialogDescription="Review previous wallet budgets, filter the range, and jump back into edit mode from here."
                historyEmptyMessage="No group budgets fall inside the selected range."
                historyTriggerLabel="View group budget history"
                onBudgetFormChange={handleWalletBudgetFormChange}
                onBudgetSubmit={handleWalletBudgetSubmit}
                onBudgetEditCancel={handleWalletBudgetEditCancel}
                onBudgetEditStart={handleWalletBudgetEditStart}
                onBudgetDelete={handleWalletBudgetDelete}
                onBudgetHistoryRangeChange={setWalletBudgetHistoryRange}
                onOpenBudgetHistory={() => setIsWalletBudgetHistoryOpen(true)}
                onCloseBudgetHistory={() => setIsWalletBudgetHistoryOpen(false)}
              />
            )}

            {(walletSubTab === "members" || walletSubTab === "all") && (
              <SurfaceCard className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  eyebrow="Group roster"
                  title="Members & Roles"
                  description="View all members in this shared wallet and manage invitations."
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="data-pill">
                        {selectedWallet.members.length} {selectedWallet.members.length === 1 ? "member" : "members"}
                      </span>
                    </div>
                  }
                />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedWallet.members.map((member) => (
                    <article
                      key={member.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={getMemberAvatarUrl(member.display_name, member.email)}
                            alt={member.display_name}
                            className="h-10 w-10 shrink-0 rounded-full object-cover border border-[color:var(--border)]"
                          />
                          <div>
                            <strong className="block text-base text-ink">
                              {member.display_name}
                            </strong>
                            <p className="mt-1 text-sm text-secondary">
                              {member.role}
                              {member.invite_status === "pending"
                                ? " • invite pending"
                                : ""}
                            </p>
                          </div>
                        </div>
                        {isWalletOwner && member.role !== "owner" ? (
                          <button
                            type="button"
                            className="ui-button-danger !p-1.5"
                            disabled={
                              isSubmitting ||
                              removingMemberIds.includes(member.id)
                            }
                            onClick={() => {
                              if (
                                confirm(
                                  `Remove ${member.display_name} from this group?`,
                                )
                              ) {
                                setRemovingMemberIds((c) => [
                                  ...new Set([...c, member.id]),
                                ]);
                                onRemoveWalletMember(
                                  selectedWallet.wallet.id,
                                  member.id,
                                ).finally(() =>
                                  setRemovingMemberIds((c) =>
                                    c.filter((id) => id !== member.id),
                                  ),
                                );
                              }
                            }}
                            title="Remove member"
                          >
                            {removingMemberIds.includes(member.id) ? (
                              <svg
                                className="size-4 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="size-4"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <form
                  className="grid gap-3"
                  onSubmit={handleAddWalletMemberSubmit}
                  noValidate
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div className="grid gap-2">
                      <input
                        value={inviteDisplayName}
                        onChange={(event) =>
                          setInviteDisplayName(event.target.value)
                        }
                        placeholder="Invite member name *"
                        required
                        aria-invalid={
                          showMemberValidation &&
                          Boolean(memberErrors.displayName)
                        }
                      />
                      {showMemberValidation && memberErrors.displayName ? (
                        <span className="text-sm text-[color:var(--danger-text)]">
                          {memberErrors.displayName}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <input
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="Email to link existing user *"
                        required
                        aria-invalid={
                          showMemberValidation && Boolean(memberErrors.email)
                        }
                      />
                      {showMemberValidation && memberErrors.email ? (
                        <span className="text-sm text-[color:var(--danger-text)]">
                          {memberErrors.email}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="submit"
                      className="ui-button-secondary justify-center"
                      disabled={isSubmitting}
                    >
                      {submittingAction === "member"
                        ? "Saving..."
                        : "Add member"}
                    </button>
                  </div>
                </form>
              </SurfaceCard>
            )}

              {isExpenseModalOpen ? (
                <ModalFrame
                  onClose={() => setIsExpenseModalOpen(false)}
                  className="flex max-h-[92vh] flex-col p-0"
                >
                  <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-7">
                    <div className="flex gap-4 flex-row items-start justify-between">
                      <div className="space-y-2">
                        <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink sm:text-3xl">
                          All shared expenses
                        </h2>
                        <p className="text-sm leading-7 text-secondary">
                          {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""} found
                          {selectedWallet?.expensePagination && selectedWallet.expensePagination.total > selectedWallet.expenses.length ? (
                            <span className="block text-xs text-amber-600 font-medium mt-1">
                              Showing {selectedWallet.expenses.length} of {selectedWallet.expensePagination.total} expenses.
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {selectedWallet?.expensePagination?.hasMore ? (
                          <button
                            type="button"
                            className="ui-button-secondary ui-button-sm flex items-center gap-1.5"
                            onClick={onLoadMoreExpenses}
                            disabled={isLoading || isLoadingMoreExpenses}
                            title="Load 50 more older expenses"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                              <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.63l3.72-3.72a.75.75 0 1 1 1.06 1.06l-5 5a.75.75 0 0 1-1.06 0l-5-5a.75.75 0 1 1 1.06-1.06l3.72 3.72V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                            </svg>
                            <span className="hidden sm:inline">{isLoading || isLoadingMoreExpenses ? "Loading..." : "Load More"}</span>
                            <span className="inline sm:hidden">{isLoading || isLoadingMoreExpenses ? "..." : "+50"}</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ui-button-secondary shrink-0"
                          onClick={() => setIsExpenseModalOpen(false)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <FilterDropdown
                        label="Month"
                        value={expenseFilterMonth}
                        placeholder="All months"
                        onChange={setExpenseFilterMonth}
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
                        label="Category"
                        value={expenseFilterCategory}
                        placeholder="All categories"
                        onChange={setExpenseFilterCategory}
                        searchable
                        options={[
                          { value: "all", label: "All categories" },
                          ...expenseCategoryOptions.map((c) => {
                            const match = budgetCategoryOptions.find(
                              (opt) => opt.label.toLowerCase() === c.toLowerCase()
                            );
                            return {
                              value: c,
                              label: c,
                              icon: match ? <CategoryIcon iconId={match.icon} /> : undefined,
                            };
                          }),
                        ]}
                      />
                      <FilterDropdown
                        label="Amount"
                        value={expenseFilterAmount}
                        placeholder="Any amount"
                        onChange={setExpenseFilterAmount}
                        options={[
                          { value: "all", label: "Any amount" },
                          { value: "lt100", label: "Under 100" },
                          { value: "100to500", label: "100 – 500" },
                          { value: "gt500", label: "Over 500" },
                        ]}
                      />
                      <FilterDropdown
                        label="Platform / Source"
                        value={expenseFilterPlatform}
                        placeholder="All platforms"
                        onChange={setExpenseFilterPlatform}
                        options={[
                          { value: "all", label: "All platforms" },
                          { value: "none", label: "No platform" },
                          ...PLATFORMS.filter((p) => p.id !== "others").map((p) => ({
                            value: p.id,
                            label: p.name,
                            icon: <img src={p.logo} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />,
                          })),
                          { value: "others", label: "Others" },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    {filteredExpenses.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-500 mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-ink">No matches in loaded data</p>
                        <p className="mt-1 max-w-xs text-xs text-secondary">
                          None of the {selectedWallet.expenses.length} loaded expenses match these filters.
                          {selectedWallet.expensePagination?.hasMore
                            ? " Use \"Load More\" above to fetch older data and search further back."
                            : " All available data has been loaded."}
                        </p>
                        {selectedWallet.expensePagination?.hasMore ? (
                          <button
                            type="button"
                            className="ui-button-secondary mt-5 flex items-center gap-2 text-sm"
                            onClick={onLoadMoreExpenses}
                            disabled={isLoading}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                              <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.63l3.72-3.72a.75.75 0 1 1 1.06 1.06l-5 5a.75.75 0 0 1-1.06 0l-5-5a.75.75 0 1 1 1.06-1.06l3.72 3.72V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                            </svg>
                            {isLoading ? "Loading older history..." : "Load older history"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {/* Desktop View */}
                        <div className="hidden lg:grid lg:gap-3">
                          {filteredExpenses.map((expense) => (
                            <article
                              key={expense.id}
                              className={cn(
                                "rounded-2xl border p-4 shadow-sm transition-all duration-200",
                                selectedExpenseIds.includes(expense.id)
                                  ? "border-primary/25 bg-success-tint"
                                  : "border-[color:var(--border)] bg-white/80",
                                deletingExpenseIds.includes(expense.id) && "animate-delete",
                              )}
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${expense.description}`}
                                    checked={selectedExpenseIds.includes(expense.id)}
                                    disabled={deletingExpenseIds.includes(expense.id)}
                                    onChange={() => handleToggleExpenseSelection(expense.id)}
                                    className="mr-1"
                                  />
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success-tint/60 text-ink shadow-sm">
                                    <CategoryIcon
                                      iconId={
                                        budgetCategoryOptions.find(
                                          (option) => option.label === expense.category,
                                        )?.icon ?? "other"
                                      }
                                    />
                                  </span>
                                  {expense.platform ? (
                                    <PlatformPicker value={expense.platform} onChange={null} className="shrink-0 self-center" />
                                  ) : null}
                                  <div className="min-w-0 space-y-1">
                                    <strong className="block truncate text-base font-semibold text-ink">
                                      {expense.description}
                                    </strong>
                                    <p className="text-xs text-secondary leading-none">
                                      {expense.category} · paid by <span className="font-medium text-ink">{expense.paid_by_member_name?.split(" ")[0]}</span> · {expense.date}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3.5 shrink-0 justify-between sm:justify-end">
                                  <div className="text-left sm:text-right">
                                    <strong className="block text-xl font-bold tracking-tight text-ink">
                                      {formatCurrency(expense.amount, selectedWallet?.wallet.currency)}
                                    </strong>
                                    <span className="text-xs font-medium text-secondary">
                                      {expense.split_rule} split
                                    </span>
                                  </div>
                                  <div className="pl-2 border-l border-[color:var(--border)]/60">
                                    <ItemActionButtons
                                      description={expense.description}
                                      isDeleting={deletingExpenseIds.includes(expense.id)}
                                      onEdit={() => {
                                        handleStartExpenseEdit(expense.id);
                                        setIsExpenseModalOpen(false);
                                      }}
                                      onDelete={() => void handleDeleteExpenseClick(expense.id)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>

                        {/* Mobile View */}
                        <div className="grid gap-3 lg:hidden">
                          {filteredExpenses.map((expense) => (
                            <article
                              key={expense.id}
                              className={cn(
                                "table-card-mobile space-y-4 transition-all duration-200",
                                selectedExpenseIds.includes(expense.id)
                                  ? "border-primary/25 bg-success-tint"
                                  : "border-[color:var(--border)] bg-white/80",
                                deletingExpenseIds.includes(expense.id) && "animate-delete",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${expense.description}`}
                                    checked={selectedExpenseIds.includes(expense.id)}
                                    disabled={deletingExpenseIds.includes(expense.id)}
                                    onChange={() => handleToggleExpenseSelection(expense.id)}
                                  />
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success-tint text-ink shadow-sm">
                                    <CategoryIcon
                                      iconId={
                                        budgetCategoryOptions.find(
                                          (option) => option.label === expense.category,
                                        )?.icon ?? "other"
                                      }
                                    />
                                  </span>
                                  {expense.platform ? (
                                    <PlatformPicker value={expense.platform} onChange={null} className="shrink-0 self-center" />
                                  ) : null}
                                </div>
                                <strong className="text-xl text-ink">{formatCurrency(expense.amount, selectedWallet?.wallet.currency)}</strong>
                              </div>

                              <div className="space-y-1">
                                <strong className="block text-base font-semibold text-ink">{expense.description}</strong>
                              </div>

                              <div className="flex items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800/60 pt-2.5">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                                  <span className="rounded-full border border-[color:var(--border)] bg-white/80 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.15em] text-secondary">{expense.category}</span>
                                  <span>paid by <span className="font-medium text-ink">{expense.paid_by_member_name?.split(" ")[0]}</span></span>
                                  <span>•</span>
                                  <span>{expense.date}</span>
                                  <span>•</span>
                                  <span className="text-xs font-medium text-secondary">
                                    {expense.split_rule} split
                                  </span>
                                </div>
                                <ItemActionButtons
                                  description={expense.description}
                                  isDeleting={deletingExpenseIds.includes(expense.id)}
                                  onEdit={() => {
                                    handleStartExpenseEdit(expense.id);
                                    setIsExpenseModalOpen(false);
                                  }}
                                  onDelete={() => void handleDeleteExpenseClick(expense.id)}
                                />
                              </div>
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </ModalFrame>
              ) : null}

              {isSettlementModalOpen ? (
                <ModalFrame
                  onClose={() => setIsSettlementModalOpen(false)}
                  className="flex max-h-[92vh] flex-col p-0"
                >
                  <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-7">
                    <div className="flex gap-4 flex-row items-start justify-between">
                      <div className="space-y-2">
                        <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink sm:text-3xl">
                          All settlements
                        </h2>
                        <p className="text-sm leading-7 text-secondary">
                          {filteredSettlements.length} settlement
                          {filteredSettlements.length !== 1 ? "s" : ""} found
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ui-button-secondary shrink-0"
                        onClick={() => setIsSettlementModalOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <FilterDropdown
                        label="Month"
                        value={settlementFilterMonth}
                        placeholder="All months"
                        onChange={setSettlementFilterMonth}
                        searchable={settlementMonthOptions.length > 6}
                        options={[
                          { value: "all", label: "All months" },
                          ...settlementMonthOptions.map((m) => ({
                            value: m,
                            label: formatBudgetMonth(m),
                          })),
                        ]}
                      />
                      <FilterDropdown
                        label="Amount"
                        value={settlementFilterAmount}
                        placeholder="Any amount"
                        onChange={setSettlementFilterAmount}
                        options={[
                          { value: "all", label: "Any amount" },
                          { value: "lt100", label: "Under 100" },
                          { value: "100to500", label: "100 – 500" },
                          { value: "gt500", label: "Over 500" },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    {filteredSettlements.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted">
                        No settlements match the current filters.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {filteredSettlements.map((settlement) => (
                          <article
                            key={settlement.id}
                            className="rounded-2xl border border-[color:var(--border)] bg-white/80 p-4 shadow-sm"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 space-y-1.5">
                                <strong className="block truncate text-base text-ink">
                                  {settlement.from_member_name} paid{" "}
                                  {settlement.to_member_name}
                                </strong>
                                <p className="text-sm leading-6 text-secondary">
                                  {settlement.date}
                                  {settlement.note
                                    ? ` · ${settlement.note}`
                                    : ""}
                                </p>
                              </div>
                              <strong className="shrink-0 text-xl text-ink">
                                {formatCurrency(settlement.amount, selectedWallet?.wallet.currency)}
                              </strong>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="ui-button-ghost"
                                onClick={() => {
                                  handleStartSettlementEdit(settlement.id);
                                  setIsSettlementModalOpen(false);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ui-button-danger"
                                disabled={deletingSettlementIds.includes(
                                  settlement.id,
                                )}
                                onClick={() =>
                                  void handleDeleteSettlementClick(
                                    settlement.id,
                                  )
                                }
                              >
                                {deletingSettlementIds.includes(settlement.id)
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </ModalFrame>
              ) : null}
            </>
          )}
        </section>
      </section>
        </div>
      )}

      {viewMode === "loans" && (
        <section className="space-y-6">
          {isLoansLoading ? (
            <SurfaceCard className="relative overflow-hidden border-emerald-500/20 p-12 text-center flex flex-col items-center justify-center min-h-[380px] shadow-sm bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(244,249,246,0.85))] dark:bg-zinc-900/90">
              <div className="relative flex items-center justify-center mb-4">
                <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                <span className="absolute text-2xl">💸</span>
              </div>
              <h3 className="text-xl font-bold font-display text-ink tracking-tight">
                Loading Peer Loans &amp; Lending...
              </h3>
              <p className="mt-2 text-sm text-secondary max-w-md">
                Downloading your lent and borrowed ledgers, active interest schedules, and repayment records.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-1.5 rounded-full border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Syncing loan data
              </div>
            </SurfaceCard>
          ) : (
            <>
              {/* Top Mode Navigation: Lent vs Borrowed vs Unified Mini-Statement */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[color:var(--border)] pb-4">
            <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 dark:bg-zinc-800/70 rounded-2xl border border-[color:var(--border)] shrink-0">
              <button
                type="button"
                onClick={() => setLoanTab("lent")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                  loanTab === "lent"
                    ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                    : "text-secondary hover:text-ink"
                )}
              >
                <span>💸 Money Lent</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-2xs text-emerald-800 dark:text-emerald-300 font-semibold">
                  {lentLoansList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLoanTab("borrowed")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                  loanTab === "borrowed"
                    ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-sm"
                    : "text-secondary hover:text-ink"
                )}
              >
                <span>📥 Money Borrowed</span>
                <span className="rounded-full bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 text-2xs text-amber-800 dark:text-amber-300 font-semibold">
                  {borrowedLoansList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLoanTab("statement")}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
                  loanTab === "statement"
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-secondary hover:text-ink"
                )}
              >
                <span>📑 Mini-Statement</span>
                <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/80 px-2 py-0.5 text-2xs text-indigo-800 dark:text-indigo-300 font-semibold">
                  {unifiedStatementItems.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {loanTab === "lent" && (
                <button
                  type="button"
                  className="ui-button-primary !py-2 !px-4 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  onClick={() => handleOpenCreateLoan("lent")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  <span> Lend Money</span>
                </button>
              )}

              {loanTab === "borrowed" && (
                <button
                  type="button"
                  className="ui-button-primary !py-2 !px-4 text-xs sm:text-sm font-semibold flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                  onClick={() => handleOpenCreateLoan("borrowed")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  <span> Record Borrowed</span>
                </button>
              )}

              {loanTab === "statement" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="ui-button-secondary ui-button-sm flex items-center gap-1 cursor-pointer"
                    onClick={() => handleOpenCreateLoan("lent")}
                  >
                    <span> Lend</span>
                  </button>
                  <button
                    type="button"
                    className="ui-button-secondary ui-button-sm flex items-center gap-1 cursor-pointer"
                    onClick={() => handleOpenCreateLoan("borrowed")}
                  >
                    <span> Borrow</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* LENT OR BORROWED VIEW */}
          {loanTab !== "statement" ? (
            <>
              {/* Top Aggregate Summary Metrics Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      {loanTab === "borrowed" ? "Total Principal Borrowed" : "Total Principal Lent"}
                    </p>
                    <span className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl",
                      loanTab === "borrowed"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                        : "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                    )}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                      </svg>
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-ink">
                    {formatCurrency((loanTab === "borrowed" ? borrowedLoansAggregate.totalBorrowed : lentLoansAggregate.totalLent).toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    Across {loanTab === "borrowed" ? borrowedLoansAggregate.totalLoans : lentLoansAggregate.totalLoans} {loanTab === "borrowed" ? "borrowed loan" : "lent loan"}{(loanTab === "borrowed" ? borrowedLoansAggregate.totalLoans : lentLoansAggregate.totalLoans) !== 1 ? "s" : ""}
                  </span>
                </SurfaceCard>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      {loanTab === "borrowed" ? "Interest Payable" : "Interest Accrued"}
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
                    {formatCurrency((loanTab === "borrowed" ? borrowedLoansAggregate.totalInterest : lentLoansAggregate.totalInterest).toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    Calculated per terms
                  </span>
                </SurfaceCard>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      {loanTab === "borrowed" ? "Total Paid Back" : "Total Collected"}
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {formatCurrency((loanTab === "borrowed" ? borrowedLoansAggregate.totalPaidBack : lentLoansAggregate.totalRepaid).toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    {loanTab === "borrowed" ? "Installments paid to lenders" : "Installments received"}
                  </span>
                </SurfaceCard>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      {loanTab === "borrowed" ? "Remaining to Pay" : "Outstanding to Collect"}
                    </p>
                    <span className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl",
                      loanTab === "borrowed"
                        ? "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                        : "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                    )}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-3 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                  <strong className={cn(
                    "mt-3 block text-2xl font-bold tracking-tight",
                    loanTab === "borrowed" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                  )}>
                    {formatCurrency((loanTab === "borrowed" ? borrowedLoansAggregate.totalRemaining : lentLoansAggregate.totalRemaining).toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    {loanTab === "borrowed" ? borrowedLoansAggregate.activeCount : lentLoansAggregate.activeCount} active loan{(loanTab === "borrowed" ? borrowedLoansAggregate.activeCount : lentLoansAggregate.activeCount) !== 1 ? "s" : ""}
                  </span>
                </SurfaceCard>
              </div>

              {/* Controls Bar: Search & Status Filters */}
              <SurfaceCard className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={standaloneSearch}
                        onChange={(e) => setStandaloneSearch(e.target.value)}
                        placeholder={loanTab === "borrowed" ? "Search by lender name or email..." : "Search by borrower name or email..."}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-xl"
                      />
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none">
                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                      </svg>
                      {standaloneSearch && (
                        <button
                          type="button"
                          onClick={() => setStandaloneSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary hover:text-ink cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-[color:var(--border)] shrink-0">
                      <button
                        type="button"
                        onClick={() => setStandaloneFilterStatus("all")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          standaloneFilterStatus === "all"
                            ? "bg-white dark:bg-zinc-900 text-ink shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        All ({currentCategoryLoans.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStandaloneFilterStatus("active")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          standaloneFilterStatus === "active"
                            ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setStandaloneFilterStatus("repaid")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          standaloneFilterStatus === "repaid"
                            ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        {loanTab === "borrowed" ? "Settled" : "Repaid"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStandaloneFilterStatus("overdue")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          standaloneFilterStatus === "overdue"
                            ? "bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        Overdue
                      </button>
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              {/* Loans Cards Grid */}
              {filteredStandaloneLoans.length === 0 ? (
                currentCategoryLoans.length === 0 ? (
                  <SurfaceCard className="p-8 sm:p-12 text-center space-y-4">
                    <div className={cn(
                      "mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-2xl shadow-inner",
                      loanTab === "borrowed"
                        ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                    )}>
                      {loanTab === "borrowed" ? "📥" : "💸"}
                    </div>
                    <div className="space-y-2 max-w-md mx-auto">
                      <h3 className="font-display text-xl font-bold text-ink">
                        {loanTab === "borrowed" ? "No borrowed money recorded yet" : "No peer loans tracked yet"}
                      </h3>
                      <p className="text-sm leading-6 text-secondary">
                        {loanTab === "borrowed"
                          ? "Record funds borrowed from friends, family, or lenders, schedule repayments, and track interest owed in one simple dashboard."
                          : "Lend money with customizable interest schedules, start months, and repayment tracking without requiring a shared wallet."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "ui-button-primary mt-2 inline-flex items-center gap-2 cursor-pointer",
                        loanTab === "borrowed" && "bg-amber-600 hover:bg-amber-700 text-white"
                      )}
                      onClick={() => handleOpenCreateLoan(loanTab === "borrowed" ? "borrowed" : "lent")}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                      </svg>
                      <span>{loanTab === "borrowed" ? " Record Borrowed Money" : " Lend Money to Someone"}</span>
                    </button>
                  </SurfaceCard>
                ) : (
                  <SurfaceCard className="p-8 text-center space-y-2">
                    <p className="text-base font-semibold text-ink">No matching loans found</p>
                    <p className="text-xs text-secondary">Try adjusting your search query or status filter.</p>
                  </SurfaceCard>
                )
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredStandaloneLoans.map((loan) => {
                    const {
                      principal,
                      accruedInterest,
                      totalDue,
                      totalRepaid,
                      remainingBalance,
                      isFullyPaid,
                      isOverpaid,
                      overpaidAmount,
                      progressPercent,
                      isOverdue
                    } = calculateLoanFinancials(loan);

                    const bName = getLoanBorrowerName(loan);
                    const bEmail = getLoanBorrowerEmail(loan);
                    const isBorrowed = loan.loan_type === "borrowed";

                    return (
                      <article
                        key={loan.id}
                        className={cn(
                          "rounded-3xl border p-5 shadow-sm transition-all duration-200 flex flex-col justify-between",
                          isOverpaid
                            ? "border-rose-300/80 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20"
                            : isFullyPaid
                              ? "border-emerald-200/70 bg-emerald-50/25 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                              : isOverdue
                                ? "border-red-200/80 bg-red-50/20 dark:border-red-900/40 dark:bg-red-950/10"
                                : "border-[color:var(--border)] bg-white/90 dark:bg-zinc-900/90"
                        )}
                      >
                        <div className="space-y-4">
                          {/* Card Header: Person info & status badge */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={getMemberAvatarUrl(bName, bEmail)}
                                alt={bName}
                                className="h-11 w-11 shrink-0 rounded-2xl border border-[color:var(--border)] object-cover shadow-sm"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                                  <strong className="block truncate text-base font-bold text-ink max-w-[130px] sm:max-w-[180px]">
                                    {bName}
                                  </strong>
                                  <span className={cn(
                                    "rounded-md px-1.5 py-0.2 text-2xs font-bold uppercase tracking-wider shrink-0",
                                    isBorrowed ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  )}>
                                    {isBorrowed ? "Lender" : "Borrower"}
                                  </span>
                                  {loan.is_owner === false && (
                                    <span
                                      className="rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.2 text-2xs font-bold tracking-wider shrink-0"
                                      title={`Recorded by ${bName}`}
                                    >
                                      Shared with you
                                    </span>
                                  )}
                                </div>
                                {loan.is_owner === false ? (
                                  <p className="truncate text-xs text-indigo-600 dark:text-indigo-400 font-medium max-w-[180px] sm:max-w-[240px]">
                                    Shared by {bName}
                                  </p>
                                ) : bEmail ? (
                                  <p className="truncate text-xs text-secondary max-w-[180px] sm:max-w-[240px]">
                                    {bEmail}
                                  </p>
                                ) : (
                                  <p className="text-xs text-secondary">
                                    {isBorrowed ? "Borrowed Record" : "Standalone Loan"}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0">
                              {isOverpaid ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 text-white px-2.5 py-0.5 text-xs font-bold shadow-sm animate-pulse">
                                  ⚠️ Overpaid by {formatCurrency(overpaidAmount.toFixed(2))}
                                </span>
                              ) : isFullyPaid ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                  {isBorrowed ? "✓ Settled" : "✓ Paid"}
                                </span>
                              ) : isOverdue ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/80 dark:text-red-300 animate-pulse">
                                  Overdue
                                </span>
                              ) : (
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  isBorrowed
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                                )}>
                                  Active
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Financials Overview */}
                          <div className="rounded-2xl border border-[color:var(--border)] bg-zinc-50/70 dark:bg-zinc-800/40 p-3.5 space-y-2.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs text-secondary">{isBorrowed ? "Principal Borrowed:" : "Principal Lent:"}</span>
                              <span className="text-base font-bold text-ink">
                                {formatCurrency(principal.toFixed(2))}
                              </span>
                            </div>

                            {Number(loan.interest_rate) > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-secondary">
                                  {isBorrowed ? "Interest to Pay" : "Interest"} ({loan.interest_type === "percentage" ? `${loan.interest_rate}% ${loan.interest_rate_period}` : `${currencySymbol}${loan.interest_rate} fixed`}):
                                </span>
                                <span className="font-semibold text-purple-600 dark:text-purple-400">
                                  +{formatCurrency(accruedInterest.toFixed(2))}
                                </span>
                              </div>
                            )}

                            <div className="flex items-baseline justify-between border-t border-[color:var(--border)] pt-2">
                              <span className="text-xs font-semibold text-secondary">Total Due:</span>
                              <span className="text-base font-extrabold text-ink">
                                {formatCurrency(totalDue.toFixed(2))}
                              </span>
                            </div>
                          </div>

                          {/* Repayment Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-secondary">
                                {isBorrowed ? "Paid Back:" : "Repaid:"} <strong className="text-ink">{formatCurrency(totalRepaid.toFixed(2))}</strong>
                              </span>
                              <span className={cn("font-semibold", isOverpaid ? "text-rose-600 font-bold" : isFullyPaid ? "text-emerald-600" : "text-ink")}>
                                {progressPercent}%
                              </span>
                            </div>

                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                              <div
                                className={cn(
                                  "h-full transition-all duration-300 rounded-full",
                                  isOverpaid ? "bg-rose-500" : isFullyPaid ? "bg-emerald-500" : "bg-primary"
                                )}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between pt-1 text-xs">
                              <span className="text-secondary">
                                {loan.due_date ? `Due: ${loan.due_date}` : `${isBorrowed ? "Borrowed" : "Lent"}: ${loan.lending_date}`}
                              </span>
                              {isOverpaid ? (
                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                  Overpaid: +{formatCurrency(overpaidAmount.toFixed(2))}
                                </span>
                              ) : (
                                <span className="font-semibold text-ink">
                                  {isBorrowed ? "Remaining to Pay:" : "Remaining:"} {formatCurrency(remainingBalance.toFixed(2))}
                                </span>
                              )}
                            </div>
                          </div>

                          {isOverpaid && (
                            <div className="rounded-xl border border-rose-300 bg-rose-50/90 dark:bg-rose-950/40 p-2.5 text-xs text-rose-800 dark:text-rose-300">
                              <strong className="block font-bold mb-0.5">⚠️ Overpayment Alert</strong>
                              Repayments exceed total due by <span className="font-extrabold text-rose-600 dark:text-rose-400">{formatCurrency(overpaidAmount.toFixed(2))}</span>.
                              You can use <strong>Edit</strong> or adjust repayment in Timeline.
                            </div>
                          )}

                          {loan.notes && (
                            <p className="text-xs text-secondary italic line-clamp-2 bg-white/50 dark:bg-zinc-800/30 p-2.5 rounded-xl border border-[color:var(--border)]">
                              "{loan.notes}"
                            </p>
                          )}
                        </div>

                        {/* Actions Toolbar */}
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border)] pt-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="ui-button-ghost ui-button-sm cursor-pointer"
                              onClick={() => setSelectedLoanForDetails(loan)}
                            >
                              Timeline ({loan.repayments?.length || 0})
                            </button>
                            <button
                              type="button"
                              className="ui-button-secondary ui-button-sm flex items-center gap-1 cursor-pointer"
                              onClick={() => {
                                const bKey = loan.borrower_member_id
                                  ? `member:${loan.borrower_member_id}`
                                  : `name:${getLoanBorrowerName(loan).toLowerCase()}`;
                                handleOpenBorrowerStatement(bKey);
                              }}
                              title="View monthly statement"
                            >
                              <span>📄 Statement</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!isFullyPaid && (
                              <button
                                type="button"
                                className="ui-button-primary ui-button-sm cursor-pointer"
                                onClick={() => handleOpenRepaymentModal(loan)}
                              >
                                {isBorrowed ? "+ Pay Back" : "+ Record Repayment"}
                              </button>
                            )}

                            {/* Edit & Delete are restricted to loan owner; non-owners can still record repayments & view timeline/statement */}
                            {loan.is_owner !== false ? (
                              <>
                                <button
                                  type="button"
                                  className="ui-button-secondary ui-button-sm cursor-pointer"
                                  onClick={() => handleOpenEditLoan(loan)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="ui-button-danger ui-button-sm cursor-pointer"
                                  disabled={deletingLoanIds.includes(loan.id)}
                                  onClick={() => void handleDeleteLoanClick(loan)}
                                >
                                  {deletingLoanIds.includes(loan.id) ? "..." : "Delete"}
                                </button>
                              </>
                            ) : (
                              <span
                                className="text-2xs text-secondary italic px-1.5"
                                title="Only the creator of this loan can edit terms or delete it."
                              >
                                Terms managed by creator
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* UNIFIED MINI-STATEMENT VIEW */
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Net Financial Position Card */}
                {(() => {
                  const netBalance = lentLoansAggregate.totalRemaining - borrowedLoansAggregate.totalRemaining;
                  const isNetReceivable = netBalance > 0;
                  const isBalanced = netBalance === 0;
                  return (
                    <SurfaceCard className={cn(
                      "relative overflow-hidden p-5 border",
                      isNetReceivable
                        ? "border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                        : isBalanced
                          ? "border-zinc-300/80 bg-zinc-50/40 dark:border-zinc-800/60 dark:bg-zinc-900/20"
                          : "border-rose-300/80 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                            Net Balance
                          </p>
                          <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-2xs font-bold uppercase",
                            isNetReceivable
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                              : isBalanced
                                ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                          )}>
                            {isNetReceivable ? "To Collect (+)" : isBalanced ? "Balanced" : "To Pay Back (-)"}
                          </span>
                        </div>
                        <span className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-xl",
                          isNetReceivable
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                            : isBalanced
                              ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300"
                        )}>
                          {isNetReceivable ? "📈" : isBalanced ? "⚖️" : "📉"}
                        </span>
                      </div>
                      <strong className={cn(
                        "mt-3 block text-2xl font-extrabold tracking-tight",
                        isNetReceivable
                          ? "text-emerald-700 dark:text-emerald-400"
                          : isBalanced
                            ? "text-ink"
                            : "text-rose-700 dark:text-rose-400"
                      )}>
                        {isNetReceivable
                          ? `+${formatCurrency(netBalance.toFixed(2))}`
                          : isBalanced
                            ? formatCurrency((0).toFixed(2))
                            : `-${formatCurrency(Math.abs(netBalance).toFixed(2))}`}
                      </strong>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-secondary">
                        <span>
                          {isNetReceivable
                            ? `Surplus: you will receive ${formatCurrency(Math.abs(netBalance).toFixed(2))}`
                            : isBalanced
                              ? "All loans and debts are evenly matched"
                              : `Deficit: you owe lenders ${formatCurrency(Math.abs(netBalance).toFixed(2))}`}
                        </span>
                        <span className="text-2xs opacity-80">
                          {formatCurrency(lentLoansAggregate.totalRemaining.toFixed(2))} to collect · {formatCurrency(borrowedLoansAggregate.totalRemaining.toFixed(2))} to pay back
                        </span>
                      </div>
                    </SurfaceCard>
                  );
                })()}

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      Total Money Lent
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      💸
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-ink">
                    {formatCurrency(lentLoansAggregate.totalLent.toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    {lentLoansAggregate.totalLoans} loan{lentLoansAggregate.totalLoans !== 1 ? "s" : ""} issued
                  </span>
                </SurfaceCard>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      Total Money Borrowed
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                      📥
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-ink">
                    {formatCurrency(borrowedLoansAggregate.totalBorrowed.toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    {borrowedLoansAggregate.totalLoans} loan{borrowedLoansAggregate.totalLoans !== 1 ? "s" : ""} taken
                  </span>
                </SurfaceCard>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                      Total Settled
                    </p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                      💰
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
                    {formatCurrency((lentLoansAggregate.totalRepaid + borrowedLoansAggregate.totalPaidBack).toFixed(2))}
                  </strong>
                  <span className="mt-1 block text-xs text-secondary">
                    Across both lent &amp; borrowed
                  </span>
                </SurfaceCard>
              </div>

              {/* Statement Search and Type Filter */}
              <SurfaceCard className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={statementSearch}
                        onChange={(e) => setStatementSearch(e.target.value)}
                        placeholder="Search statement by person, email, or notes..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-xl"
                      />
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none">
                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                      </svg>
                      {statementSearch && (
                        <button
                          type="button"
                          onClick={() => setStatementSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary hover:text-ink cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-[color:var(--border)] shrink-0">
                      <button
                        type="button"
                        onClick={() => setStatementFilterType("all")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          statementFilterType === "all"
                            ? "bg-white dark:bg-zinc-900 text-ink shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        All ({unifiedStatementItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementFilterType("lent")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          statementFilterType === "lent"
                            ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        Lent ({unifiedStatementItems.filter((i) => i.type === "loan_lent").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementFilterType("borrowed")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          statementFilterType === "borrowed"
                            ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        Borrowed ({unifiedStatementItems.filter((i) => i.type === "loan_borrowed").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementFilterType("repayments")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                          statementFilterType === "repayments"
                            ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm"
                            : "text-secondary hover:text-ink"
                        )}
                      >
                        Repayments ({unifiedStatementItems.filter((i) => i.type === "repayment_received" || i.type === "repayment_paid").length})
                      </button>
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              {/* Statement Ledger List */}
              {filteredStatementItems.length === 0 ? (
                <SurfaceCard className="p-8 sm:p-12 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-2xl">
                    📑
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink">
                    No transactions recorded in mini-statement
                  </h3>
                  <p className="text-sm text-secondary max-w-sm mx-auto">
                    Transactions and repayments from both lent and borrowed loans will automatically appear here chronologically.
                  </p>
                </SurfaceCard>
              ) : (
                <SurfaceCard className="overflow-hidden p-0">
                  <div className="border-b border-[color:var(--border)] px-5 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base text-ink">Unified Loans Statement</h3>
                      <p className="text-xs text-secondary">Complete chronological record of money lent, borrowed, and repaid</p>
                    </div>
                    <span className="text-xs text-secondary font-medium">
                      {filteredStatementItems.length} record{filteredStatementItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="divide-y divide-[color:var(--border)]">
                    {filteredStatementItems.map((entry) => {
                      const isLent = entry.type === "loan_lent";
                      const isBorrowed = entry.type === "loan_borrowed";
                      const isRepReceived = entry.type === "repayment_received";
                      const isRepPaid = entry.type === "repayment_paid";

                      // Cash-flow standard (Owner's bank account / cashbook perspective):
                      // Credited (+) = Cash IN (borrowed principal received into account, or loan repayment collected from borrower)
                      // Debited (-) = Cash OUT (loan principal given out to borrower, or repayment sent to lender)
                      const isCredit = isBorrowed || isRepReceived;

                      return (
                        <div
                          key={entry.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors gap-3"
                        >
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                            <span className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base shadow-sm font-semibold",
                              isCredit
                                ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300"
                                : "bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300"
                            )}>
                              {isCredit ? "↙" : "↗"}
                            </span>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-sm font-bold text-ink">
                                  {entry.counterparty}
                                </strong>
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider",
                                  isLent && "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
                                  isBorrowed && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
                                  isRepReceived && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
                                  isRepPaid && "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                                )}>
                                  {isLent ? "Money Lent" : isBorrowed ? "Money Borrowed" : isRepReceived ? "Repayment Received" : "Payment to Lender"}
                                </span>
                              </div>

                              <p className="text-xs text-secondary mt-0.5 truncate">
                                {entry.notes || (isLent ? "Loan principal disbursed to borrower" : isBorrowed ? "Borrowed principal received from lender" : isRepReceived ? "Repayment collected from borrower" : "Payment sent to lender")}
                                {entry.counterpartyEmail && ` • ${entry.counterpartyEmail}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0">
                            <div className="text-left sm:text-right">
                              <div className="flex items-center sm:justify-end gap-1.5">
                                <p className={cn(
                                  "text-base font-extrabold",
                                  isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}>
                                  {isCredit ? "+" : "-"}{formatCurrency(entry.amount.toFixed(2))}
                                </p>
                                <span className={cn(
                                  "text-2xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                                  isCredit
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                                )}>
                                  {isCredit ? "Credited" : "Debited"}
                                </span>
                              </div>
                              <span className="text-2xs text-secondary">
                                {entry.date}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="ui-button-ghost ui-button-sm cursor-pointer"
                              onClick={() => setSelectedLoanForDetails(entry.loan)}
                            >
                              Timeline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SurfaceCard>
              )}
            </div>
          )}
            </>
          )}
        </section>
      )}

      {isMobileExpenseModalOpen ? (
        <ModalFrame
          onClose={() => {
            setEditingWalletExpenseId(null);
            setIsMobileExpenseModalOpen(false);
          }}
          className="flex max-h-[92vh] flex-col p-0"
        >
          <div className="border-b border-[color:var(--border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">
                Edit group transaction
              </h2>
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setEditingWalletExpenseId(null);
                  setIsMobileExpenseModalOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5">
            {renderWalletExpenseForm()}
          </div>
        </ModalFrame>
      ) : null}

      {isMobileSettlementModalOpen ? (
        <ModalFrame
          onClose={() => {
            setEditingSettlementId(null);
            setIsMobileSettlementModalOpen(false);
          }}
          className="flex max-h-[92vh] flex-col p-0"
        >
          <div className="border-b border-[color:var(--border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">
                Edit payback
              </h2>
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setEditingSettlementId(null);
                  setIsMobileSettlementModalOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5">
            {renderSettlementForm()}
          </div>
        </ModalFrame>
      ) : null}

      {isCreateWalletModalOpen ? (
        <ModalFrame
          onClose={() => {
            if (!isSubmitting) {
              setIsCreateWalletModalOpen(false);
              setShowCreateWalletValidation(false);
            }
          }}
          className="max-w-[540px] overflow-y-auto p-5 sm:p-6"
        >
          <SectionHeader
            eyebrow="Create wallet"
            title="New shared group"
            description="Invite housemates, travel partners, or family members with custom split rules and a group photo."
          />
          <form
            className="mt-5 grid gap-4"
            onSubmit={handleCreateWalletSubmit}
            noValidate
          >
            <WalletPicturePicker
              pictureUrl={walletPictureUrl}
              pictureStats={walletPictureStats}
              isCompressing={isCompressingPicture}
              error={pictureError}
              onPictureChange={handlePictureChange}
              onRemovePicture={() => {
                setWalletPictureUrl(null);
                setWalletPictureStats(null);
                setPictureError(null);
              }}
            />

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">Wallet name</span>
              <input
                value={walletName}
                onChange={(event) => setWalletName(event.target.value)}
                placeholder="Apartment essentials"
                required
                aria-invalid={
                  showCreateWalletValidation &&
                  Boolean(createWalletErrors.name)
                }
              />
              {showCreateWalletValidation && createWalletErrors.name ? (
                <span className="text-sm text-[color:var(--danger-text)]">
                  {createWalletErrors.name}
                </span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              Description
              <textarea
                value={walletDescription}
                onChange={(event) => setWalletDescription(event.target.value)}
                rows={3}
                placeholder="What this wallet is for"
              />
            </label>

            <FilterDropdown
              label="Default split rule"
              variant="form"
              value={walletSplitRule}
              onChange={(val) => setWalletSplitRule(val as SplitRule)}
              options={[
                { value: "equal", label: "Equal" },
                { value: "fixed", label: "Fixed amounts" },
                { value: "percentage", label: "Percentages" },
              ]}
            />

            <FilterDropdown
              label="Currency"
              variant="form"
              value={walletCurrency}
              searchable
              onChange={(val) => setWalletCurrency(val)}
              options={[
                { value: "INR", label: "INR (₹)" },
                { value: "USD", label: "USD ($)" },
                { value: "EUR", label: "EUR (€)" },
                { value: "GBP", label: "GBP (£)" },
                { value: "JPY", label: "JPY (¥)" },
                { value: "CAD", label: "CAD (C$)" },
                { value: "AUD", label: "AUD (A$)" },
                { value: "CHF", label: "CHF (Fr)" },
                { value: "CNY", label: "CNY (元)" },
                { value: "SGD", label: "SGD (S$)" },
                { value: "NZD", label: "NZD (NZ$)" },
              ]}
            />

            <label className="grid gap-2 text-sm font-medium text-secondary">
              Members
              <textarea
                value={walletMembersText}
                onChange={(event) => setWalletMembersText(event.target.value)}
                rows={4}
                placeholder="One name per line or comma separated"
              />
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setIsCreateWalletModalOpen(false);
                  setShowCreateWalletValidation(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-button-primary"
                disabled={isSubmitting || isCompressingPicture}
              >
                {submittingAction === "create-wallet"
                  ? "Saving..."
                  : "Create wallet"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {isWalletEditModalOpen ? (
        <ModalFrame
          onClose={() => handleCancelWalletEdit()}
          className="max-w-[520px] overflow-y-auto p-5 sm:p-6"
        >
          <SectionHeader
            eyebrow="Edit wallet"
            title="Edit group details"
            description="Update the name, description, default split rule, and members of this shared group."
          />
          <form
            className="mt-5 grid gap-4"
            onSubmit={handleUpdateWalletSubmit}
            noValidate
          >
            <WalletPicturePicker
              pictureUrl={editWalletPictureUrl}
              pictureStats={editWalletPictureStats}
              isCompressing={isCompressingEditPicture}
              error={editPictureError}
              onPictureChange={handleEditPictureChange}
              onRemovePicture={() => {
                setEditWalletPictureUrl(null);
                setEditWalletPictureStats(null);
                setEditPictureError(null);
              }}
            />

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">Wallet name</span>
              <input
                value={editWalletName}
                onChange={(event) => setEditWalletName(event.target.value)}
                placeholder="Apartment essentials"
                required
                aria-invalid={
                  showEditWalletValidation &&
                  Boolean(editWalletErrors.name)
                }
              />
              {showEditWalletValidation && editWalletErrors.name ? (
                <span className="text-sm text-[color:var(--danger-text)]">
                  {editWalletErrors.name}
                </span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              Description
              <textarea
                value={editWalletDescription}
                onChange={(event) => setEditWalletDescription(event.target.value)}
                rows={3}
                placeholder="What this wallet is for"
              />
            </label>

            <FilterDropdown
              label="Default split rule"
              variant="form"
              value={editWalletSplitRule}
              onChange={(val) => setEditWalletSplitRule(val as SplitRule)}
              options={[
                { value: "equal", label: "Equal" },
                { value: "fixed", label: "Fixed amounts" },
                { value: "percentage", label: "Percentages" },
              ]}
            />

            <FilterDropdown
              label="Currency"
              variant="form"
              value={editWalletCurrency}
              searchable
              onChange={(val) => setEditWalletCurrency(val)}
              options={[
                { value: "INR", label: "INR (₹)" },
                { value: "USD", label: "USD ($)" },
                { value: "EUR", label: "EUR (€)" },
                { value: "GBP", label: "GBP (£)" },
                { value: "JPY", label: "JPY (¥)" },
                { value: "CAD", label: "CAD (C$)" },
                { value: "AUD", label: "AUD (A$)" },
                { value: "CHF", label: "CHF (Fr)" },
                { value: "CNY", label: "CNY (元)" },
                { value: "SGD", label: "SGD (S$)" },
                { value: "NZD", label: "NZD (NZ$)" },
              ]}
            />

            <label className="grid gap-2 text-sm font-medium text-secondary">
              Members
              <textarea
                value={editWalletMembersText}
                onChange={(event) => setEditWalletMembersText(event.target.value)}
                rows={4}
                placeholder="One name per line or comma separated"
              />
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => handleCancelWalletEdit()}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-button-primary"
                disabled={isSubmitting}
              >
                {submittingAction === "update-wallet"
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </form>
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
                {deleteConfirmation.type === "single" ? "Delete shared expense?" : "Delete selected shared expenses?"}
              </h3>
              <p className="text-sm leading-6 text-secondary">
                {deleteConfirmation.type === "single" ? (
                  <>
                    Are you sure you want to permanently delete <strong className="text-ink">"{deleteConfirmation.description}"</strong> ({deleteConfirmation.amount}) from this wallet? This action cannot be undone.
                  </>
                ) : (
                  <>
                    Are you sure you want to permanently delete <strong className="text-ink">{deleteConfirmation.description}</strong> from this wallet? This action cannot be undone.
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
                onClick={() => void handleConfirmDeleteExpense()}
              >
                Delete
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {/* Create / Edit Loan Modal */}
      {isLoanModalOpen ? (
        <ModalFrame
          onClose={() => {
            setIsLoanModalOpen(false);
            setEditingLoan(null);
          }}
          className="max-w-[540px] overflow-y-auto p-5 sm:p-6"
        >
          <SectionHeader
            eyebrow={loanType === "borrowed" ? "Money Borrowed" : "Peer Lending"}
            title={
              editingLoan
                ? (loanType === "borrowed" ? "Edit borrowed loan terms" : "Edit lent loan terms")
                : (loanType === "borrowed" ? "Record borrowed money" : (viewMode === "loans" || !selectedWallet ? "Lend money to someone" : "Lend money to member"))
            }
            description={
              loanType === "borrowed"
                ? "Record money you borrowed from someone, repayment terms, and interest schedule."
                : "Set the principal, custom interest schedule, start month, and optional due date."
            }
          />
          <form
            className="mt-5 grid gap-4"
            onSubmit={handleLoanFormSubmit}
            noValidate
          >
            {/* Loan Type Switcher (Only when creating new loan) */}
            {!editingLoan && (
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl border border-[color:var(--border)]">
                <button
                  type="button"
                  onClick={() => setLoanType("lent")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    loanType === "lent"
                      ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "text-secondary hover:text-ink"
                  )}
                >
                  <span className="flex items-center gap-1.5 font-bold">💸 Money Lent</span>
                  <span className="text-2xs font-normal opacity-80">You gave money (Receivable)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLoanType("borrowed")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    loanType === "borrowed"
                      ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-sm"
                      : "text-secondary hover:text-ink"
                  )}
                >
                  <span className="flex items-center gap-1.5 font-bold">📥 Money Borrowed</span>
                  <span className="text-2xs font-normal opacity-80">You took money (Payable)</span>
                </button>
              </div>
            )}

            {/* Borrower or Lender */}
            {viewMode === "loans" || !selectedWallet || (editingLoan && editingLoan.borrower_name) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  <span className="required-mark">
                    {loanType === "borrowed" ? "Lender / Creditor Full Name" : "Borrower Full Name"}
                  </span>
                  <input
                    value={loanBorrowerName}
                    onChange={(e) => setLoanBorrowerName(e.target.value)}
                    placeholder={loanType === "borrowed" ? "e.g. Sarah Connor" : "e.g. Alex Johnson"}
                    disabled={Boolean(editingLoan)}
                    required
                  />
                  {showLoanValidation && loanErrors.borrower && (
                    <span className="text-sm text-[color:var(--danger-text)]">
                      {loanErrors.borrower}
                    </span>
                  )}
                </label>
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  {loanType === "borrowed" ? "Lender Email (Optional)" : "Borrower Email (Optional)"}
                  <input
                    type="email"
                    value={loanBorrowerEmail}
                    onChange={(e) => setLoanBorrowerEmail(e.target.value)}
                    placeholder="contact@example.com"
                    disabled={Boolean(editingLoan)}
                  />
                </label>
              </div>
            ) : (
              <FilterDropdown
                label={loanType === "borrowed" ? "Lender (Wallet Member)" : "Borrower (Wallet Member)"}
                variant="form"
                required
                disabled={Boolean(editingLoan)}
                value={loanBorrowerId}
                placeholder="Select a member"
                error={showLoanValidation && loanErrors.borrower ? loanErrors.borrower : undefined}
                onChange={(val) => setLoanBorrowerId(val)}
                options={
                  selectedWallet?.members
                    .filter((m) => m.role !== "owner" || editingLoan)
                    .map((m) => ({
                      value: m.id,
                      label: `${m.display_name}${m.role === "owner" ? " (Owner)" : ""}`,
                    })) ?? []
                }
              />
            )}

            {/* Amount & Lending/Borrowing Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-secondary">
                <span className="required-mark">Principal Amount</span>
                <div className="relative">
                  <input
                    className="pl-8"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={Boolean(editingLoan)}
                    required
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 dark:text-zinc-100 z-10">
                    {currencySymbol}
                  </span>
                </div>
                {showLoanValidation && loanErrors.amount && (
                  <span className="text-sm text-[color:var(--danger-text)]">
                    {loanErrors.amount}
                  </span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                <span className="required-mark">
                  {loanType === "borrowed" ? "Borrowing Date" : "Lending Date"}
                </span>
                <input
                  type="date"
                  value={loanLendingDate}
                  onChange={(e) => {
                    setLoanLendingDate(e.target.value);
                    if (!loanInterestStartDate) {
                      setLoanInterestStartDate(e.target.value);
                    }
                  }}
                  required
                />
                {showLoanValidation && loanErrors.lendingDate && (
                  <span className="text-sm text-[color:var(--danger-text)]">
                    {loanErrors.lendingDate}
                  </span>
                )}
              </label>
            </div>

            {/* Interest Rate & Period */}
            <div className="rounded-2xl border border-[color:var(--border)] bg-zinc-50/70 p-4 dark:bg-zinc-800/30 space-y-3">
              <p className="section-eyebrow">Interest Rate & Policy</p>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-medium text-secondary">
                  <span>Interest Rate</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={loanInterestRate}
                    onChange={(e) => setLoanInterestRate(e.target.value)}
                    placeholder="0"
                  />
                </label>

                <FilterDropdown
                  label="Interest Type"
                  value={loanInterestType}
                  onChange={(val) => setLoanInterestType(val as "percentage" | "fixed" | "none")}
                  options={[
                    { value: "percentage", label: "Percentage (%)" },
                    { value: "fixed", label: `Fixed Amount (${currencySymbol})` },
                    { value: "none", label: "No Interest (0%)" },
                  ]}
                />

                <FilterDropdown
                  label="Period / Frequency"
                  value={loanInterestPeriod}
                  disabled={loanInterestType === "fixed" || loanInterestType === "none"}
                  onChange={(val) => setLoanInterestPeriod(val as "monthly" | "yearly" | "one-time")}
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                    { value: "one-time", label: "One-time Flat" },
                  ]}
                />
              </div>

              {/* Interest Start Date */}
              <label className="grid gap-1.5 text-xs font-medium text-secondary">
                <span>Interest Starts From (Month / Date)</span>
                <input
                  type="date"
                  value={loanInterestStartDate}
                  onChange={(e) => setLoanInterestStartDate(e.target.value)}
                />
                <span className="text-2xs text-muted">
                  Choose when interest begins accruing (e.g. grace period before interest applies).
                </span>
              </label>
            </div>

            {/* Due Date & Notes */}
            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span>Expected Payback Due Date (Optional)</span>
              <input
                type="date"
                value={loanDueDate}
                onChange={(e) => setLoanDueDate(e.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span>Loan Notes / Reason</span>
              <textarea
                value={loanNotes}
                onChange={(e) => setLoanNotes(e.target.value)}
                rows={2}
                placeholder="Reason or notes regarding this loan"
              />
            </label>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setIsLoanModalOpen(false);
                  setEditingLoan(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-button-primary"
                disabled={isSubmitting}
              >
                {submittingAction === "loan"
                  ? "Saving..."
                  : editingLoan
                    ? "Update terms"
                    : "Create loan"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {/* Record Repayment Modal */}
      {isRepaymentModalOpen && activeLoanForRepayment ? (
        <ModalFrame
          onClose={() => {
            setIsRepaymentModalOpen(false);
            setActiveLoanForRepayment(null);
          }}
          className="max-w-[480px] p-5 sm:p-6"
        >
          <SectionHeader
            eyebrow={activeLoanForRepayment.loan_type === "borrowed" ? "Pay Back Lender" : "Collect Repayment"}
            title={
              activeLoanForRepayment.loan_type === "borrowed"
                ? `Payment to ${getLoanBorrowerName(activeLoanForRepayment)}`
                : `Repayment from ${getLoanBorrowerName(activeLoanForRepayment)}`
            }
            description={
              activeLoanForRepayment.loan_type === "borrowed"
                ? "Log an installment or settlement paid back to this lender."
                : "Log an installment or full repayment received from this borrower."
            }
          />
          <form
            className="mt-5 grid gap-4"
            onSubmit={handleRepaymentSubmit}
            noValidate
          >
            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">
                {activeLoanForRepayment.loan_type === "borrowed" ? "Payment Amount" : "Repayment Amount"}
              </span>
              <div className="relative">
                <input
                  className="pl-8"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 dark:text-zinc-100 z-10">
                  {currencySymbol}
                </span>
              </div>
              {showRepaymentValidation && repaymentErrors.amount && (
                <span className="text-sm text-[color:var(--danger-text)]">
                  {repaymentErrors.amount}
                </span>
              )}
            </label>

            {/* Overpayment Warning */}
            {(() => {
              const fin = calculateLoanFinancials(activeLoanForRepayment);
              const entered = parseFloat(repaymentAmount.trim()) || 0;
              if (entered > fin.remainingBalance && fin.remainingBalance > 0) {
                const diff = entered - fin.remainingBalance;
                return (
                  <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200">
                    <strong className="block text-rose-700 dark:text-rose-400 font-bold mb-0.5">⚠️ Overpayment Notice</strong>
                    This amount exceeds the remaining balance ({formatCurrency(fin.remainingBalance.toFixed(2))}) by{" "}
                    <span className="font-extrabold text-rose-900 dark:text-rose-100">{formatCurrency(diff.toFixed(2))}</span>.
                    If recorded, this loan will be marked as <strong className="text-rose-600 dark:text-rose-400">Overpaid</strong>.
                  </div>
                );
              }
              return null;
            })()}

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">Payment Date</span>
              <input
                type="date"
                value={repaymentDate}
                onChange={(e) => setRepaymentDate(e.target.value)}
                required
              />
              {showRepaymentValidation && repaymentErrors.date && (
                <span className="text-sm text-[color:var(--danger-text)]">
                  {repaymentErrors.date}
                </span>
              )}
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span>Payment Reference / Notes</span>
              <input
                value={repaymentNotes}
                onChange={(e) => setRepaymentNotes(e.target.value)}
                placeholder="e.g. UPI Ref #48291, Cash payment"
              />
            </label>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setIsRepaymentModalOpen(false);
                  setActiveLoanForRepayment(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-button-primary"
                disabled={isSubmitting}
              >
                {submittingAction === "loan-repayment"
                  ? "Recording..."
                  : activeLoanForRepayment.loan_type === "borrowed"
                    ? "Record Payment Made"
                    : "Record Repayment Received"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {/* Loan Details & Timeline Modal */}
      {selectedLoanForDetails ? (() => {
        const liveLoan = (selectedLoanForDetails.wallet_id ? selectedWallet?.loans?.find((l) => l.id === selectedLoanForDetails.id) : loans.find((l) => l.id === selectedLoanForDetails.id)) || selectedLoanForDetails;
        const borrowerName = getLoanBorrowerName(liveLoan);
        const borrowerEmail = getLoanBorrowerEmail(liveLoan);
        const canManageLoan = liveLoan.is_owner !== false;
        const loanCurrency = liveLoan.wallet_id ? selectedWallet?.wallet.currency : undefined;

        const {
          principal,
          accruedInterest,
          totalRepaid,
          remainingBalance,
          isFullyPaid,
          isOverpaid,
          overpaidAmount,
          isOverdue
        } = calculateLoanFinancials(liveLoan);

        return (
          <ModalFrame
            onClose={() => setSelectedLoanForDetails(null)}
            className="flex max-h-[92vh] max-w-[620px] flex-col p-0 overflow-hidden"
          >
            <div className="border-b border-[color:var(--border)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="section-eyebrow">
                      {liveLoan.loan_type === "borrowed" ? "Borrowed Loan Timeline" : "Lent Loan Timeline"}
                    </span>
                    {isOverpaid && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 text-white px-2 py-0.5 text-2xs font-bold shadow-sm animate-pulse">
                        ⚠️ Overpaid by {formatCurrency(overpaidAmount.toFixed(2), loanCurrency)}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-bold text-ink">
                    {liveLoan.loan_type === "borrowed" ? `Loan from ${borrowerName}` : `Loan to ${borrowerName}`}
                  </h2>
                  {borrowerEmail && (
                    <p className="text-xs text-secondary">{borrowerEmail}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canManageLoan && (
                    <button
                      type="button"
                      className="ui-button-secondary ui-button-sm"
                      onClick={() => {
                        setSelectedLoanForDetails(null);
                        handleOpenEditLoan(liveLoan);
                      }}
                    >
                      ✏️ Edit Terms
                    </button>
                  )}
                  <button
                    type="button"
                    className="ui-button-secondary ui-button-sm"
                    onClick={() => setSelectedLoanForDetails(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto p-6 space-y-6">
              {/* Financial Cards Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                  <span className="text-2xs text-secondary">Principal</span>
                  <p className="text-base font-bold text-ink">{formatCurrency(principal.toFixed(2), loanCurrency)}</p>
                </div>
                <div className="rounded-xl bg-amber-50/50 p-3 dark:bg-amber-950/20">
                  <span className="text-2xs text-amber-700 dark:text-amber-300">
                    {liveLoan.loan_type === "borrowed" ? "Interest to Pay" : "Interest"}
                  </span>
                  <p className="text-base font-bold text-ink">{formatCurrency(accruedInterest.toFixed(2), loanCurrency)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
                  <span className="text-2xs text-emerald-700 dark:text-emerald-300">
                    {liveLoan.loan_type === "borrowed" ? "Paid Back" : "Repaid"}
                  </span>
                  <p className="text-base font-bold text-ink">{formatCurrency(totalRepaid.toFixed(2), loanCurrency)}</p>
                </div>
                <div className={cn("rounded-xl p-3", isOverpaid ? "bg-rose-50/80 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800" : "bg-purple-50/50 dark:bg-purple-950/20")}>
                  <span className={cn("text-2xs", isOverpaid ? "text-rose-700 dark:text-rose-300 font-bold" : "text-purple-700 dark:text-purple-300")}>
                    {isOverpaid ? "Overpaid By" : liveLoan.loan_type === "borrowed" ? "Remaining Debt" : "Balance"}
                  </span>
                  <p className={cn("text-base font-bold", isOverpaid ? "text-rose-600 dark:text-rose-400 font-extrabold" : "text-ink")}>
                    {isOverpaid ? `+${formatCurrency(overpaidAmount.toFixed(2), loanCurrency)}` : formatCurrency(remainingBalance.toFixed(2), loanCurrency)}
                  </p>
                </div>
              </div>

              {/* Terms Overview */}
              <div className="rounded-2xl border border-[color:var(--border)] p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-secondary">{liveLoan.loan_type === "borrowed" ? "Borrowed Date:" : "Lending Date:"}</span>
                  <span className="font-semibold text-ink">{liveLoan.lending_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Interest Policy:</span>
                  <span className="font-semibold text-ink">
                    {Number(liveLoan.interest_rate) > 0
                      ? liveLoan.interest_type === "percentage"
                        ? `${liveLoan.interest_rate}% / ${liveLoan.interest_rate_period}`
                        : `${formatCurrency(String(liveLoan.interest_rate), loanCurrency)} fixed`
                      : "No Interest"}
                  </span>
                </div>
                {liveLoan.interest_start_date && (
                  <div className="flex justify-between">
                    <span className="text-secondary">Interest Start Date:</span>
                    <span className="font-semibold text-ink">{liveLoan.interest_start_date}</span>
                  </div>
                )}
                {liveLoan.due_date && (
                  <div className="flex justify-between">
                    <span className="text-secondary">Due Date:</span>
                    <span className="font-semibold text-ink">{liveLoan.due_date} {isOverdue && "(Overdue)"}</span>
                  </div>
                )}
                {liveLoan.notes && (
                  <div className="border-t border-[color:var(--border)] pt-2 mt-2">
                    <span className="text-secondary">Notes:</span>
                    <p className="mt-1 italic text-ink">{liveLoan.notes}</p>
                  </div>
                )}
              </div>

              {/* Repayments History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-ink">
                    {liveLoan.loan_type === "borrowed"
                      ? `Payment History (${liveLoan.repayments?.length || 0})`
                      : `Repayment History (${liveLoan.repayments?.length || 0})`}
                  </h4>
                  {!isFullyPaid && (
                    <button
                      type="button"
                      className="ui-button-primary !py-1 !px-2.5 text-xs"
                      onClick={() => {
                        handleOpenRepaymentModal(liveLoan);
                      }}
                    >
                      {liveLoan.loan_type === "borrowed" ? "+ Pay Lender" : "+ Add Payment"}
                    </button>
                  )}
                </div>

                {(!liveLoan.repayments || liveLoan.repayments.length === 0) ? (
                  <p className="text-xs text-secondary text-center py-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl">
                    {liveLoan.loan_type === "borrowed"
                      ? "No payments have been made to this lender yet."
                      : "No repayments have been recorded for this loan yet."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {liveLoan.repayments.map((repayment) => (
                      <div
                        key={repayment.id}
                        className="flex items-center justify-between rounded-xl border border-[color:var(--border)] p-3 bg-white/70 dark:bg-zinc-800/40"
                      >
                        <div>
                          <p className="font-bold text-sm text-ink">
                            {formatCurrency(repayment.amount, loanCurrency)}
                          </p>
                          <p className="text-2xs text-secondary">
                            {liveLoan.loan_type === "borrowed" ? "Paid on " : "Received on "}
                            {repayment.repayment_date} {repayment.notes && `• ${repayment.notes}`}
                          </p>
                        </div>
                        {canManageLoan && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="ui-button-secondary ui-button-sm"
                              onClick={() => handleOpenEditRepayment(liveLoan, repayment)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ui-button-danger ui-button-sm"
                              disabled={deletingLoanRepaymentIds.includes(repayment.id)}
                              onClick={() => void handleDeleteRepaymentClick(liveLoan, repayment.id)}
                            >
                              {deletingLoanRepaymentIds.includes(repayment.id) ? "..." : "Delete"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ModalFrame>
        );
      })() : null}

      {/* Edit Repayment Modal */}
      {editingRepayment ? (
        <ModalFrame
          onClose={() => {
            setEditingRepayment(null);
            setShowEditRepaymentValidation(false);
          }}
          className="max-w-[480px] p-5 sm:p-6"
        >
          <SectionHeader
            eyebrow={editingRepayment.loan.loan_type === "borrowed" ? "Edit Payment" : "Edit Repayment"}
            title={editingRepayment.loan.loan_type === "borrowed" ? "Update Payment to Lender" : "Update Received Repayment"}
            description={
              editingRepayment.loan.loan_type === "borrowed"
                ? "Adjust the payment amount paid to this lender, date, or notes."
                : "Adjust the repayment amount collected from this borrower, date, or notes."
            }
          />
          <form
            className="mt-5 grid gap-4"
            onSubmit={handleEditRepaymentSubmit}
            noValidate
          >
            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">
                {editingRepayment.loan.loan_type === "borrowed" ? "Payment Amount" : "Repayment Amount"}
              </span>
              <div className="relative">
                <input
                  className="pl-8"
                  value={editRepaymentAmount}
                  onChange={(e) => setEditRepaymentAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none text-zinc-950 dark:text-zinc-100 z-10">
                  {currencySymbol}
                </span>
              </div>
              {showEditRepaymentValidation && (!editRepaymentAmount.trim() || isNaN(parseFloat(editRepaymentAmount)) || parseFloat(editRepaymentAmount) <= 0) && (
                <span className="text-sm text-[color:var(--danger-text)]">
                  Amount must be greater than 0.
                </span>
              )}
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span className="required-mark">Payment Date</span>
              <input
                type="date"
                value={editRepaymentDate}
                onChange={(e) => setEditRepaymentDate(e.target.value)}
                required
              />
              {showEditRepaymentValidation && !editRepaymentDate.trim() && (
                <span className="text-sm text-[color:var(--danger-text)]">
                  Payment date is required.
                </span>
              )}
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              <span>Payment Reference / Notes</span>
              <input
                value={editRepaymentNotes}
                onChange={(e) => setEditRepaymentNotes(e.target.value)}
                placeholder="e.g. UPI Ref #48291, Cash payment"
              />
            </label>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => {
                  setEditingRepayment(null);
                  setShowEditRepaymentValidation(false);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-button-primary"
                disabled={isSubmitting}
              >
                {submittingAction === "loan-repayment"
                  ? "Updating..."
                  : editingRepayment.loan.loan_type === "borrowed"
                    ? "Update Payment"
                    : "Update Repayment"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      <BorrowerMiniStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => {
          setIsStatementModalOpen(false);
          setStatementBorrowerKey(null);
        }}
        loans={viewMode === "loans" ? (loans || []) : (selectedWallet?.loans || [])}
        initialBorrowerKey={statementBorrowerKey}
        formatCurrency={(amt, curr) => formatCurrency(amt, curr || (selectedWallet ? selectedWallet.wallet.currency : undefined))}
        currencySymbol={currencySymbol}
        walletMembers={selectedWallet?.members}
        onOpenRepayment={(loan) => handleOpenRepaymentModal(loan)}
        onOpenEditLoan={(loan) => handleOpenEditLoan(loan)}
      />
    </>
  );
}
