import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { CategoryIcon } from "../components/CategoryIcon";
import { EmptyState, ModalFrame, PageHero, SectionHeader, StatusNotice, SurfaceCard, cn } from "../components/ui";
import type { BudgetForm, BudgetHistoryRange, BudgetSummary, CategoryOption, SplitRule, Wallet, WalletDetail, WalletBudget } from "../types";

type WalletsPageProps = {
  wallets: Wallet[];
  selectedWallet: WalletDetail | null;
  selectedWalletId: string | null;
  currentUserId: string | null;
  budgetCategoryOptions: CategoryOption[];
  isLoading: boolean;
  isSubmitting: boolean;
  submittingAction: string;
  statusMessage: string;
  errorMessage: string;
  formatCurrency: (amount: string) => string;
  onSelectWallet: (walletId: string) => void;
  onCreateWallet: (input: { name: string; description: string; defaultSplitRule: SplitRule; members: Array<{ displayName: string; email?: string }> }) => Promise<boolean>;
  onDeleteWallet: (walletId: string) => Promise<boolean>;
  onLeaveWallet: (walletId: string) => Promise<boolean>;
  onAddWalletMember: (walletId: string, input: { displayName: string; email?: string }) => Promise<boolean>;
  onRemoveWalletMember: (walletId: string, memberId: string) => Promise<boolean>;
  onCreateWalletExpense: (walletId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> }) => Promise<boolean>;
  onUpdateWalletExpense: (walletId: string, walletExpenseId: string, input: { paidByMemberId: string; amount: string; category: string; description: string; date: string; splitRule: SplitRule; splits: Array<{ memberId: string; value?: string }> }) => Promise<boolean>;
  onDeleteWalletExpense: (walletId: string, walletExpenseId: string) => Promise<boolean>;
  onCreateWalletBudget: (walletId: string, input: BudgetForm) => Promise<boolean>;
  onUpdateWalletBudget: (walletId: string, walletBudgetId: string, input: BudgetForm) => Promise<boolean>;
  onDeleteWalletBudget: (walletId: string, walletBudgetId: string) => Promise<boolean>;
  onCreateWalletSettlement: (walletId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }) => Promise<boolean>;
  onUpdateWalletSettlement: (walletId: string, settlementId: string, input: { fromMemberId: string; toMemberId: string; amount: string; date: string; note: string }) => Promise<boolean>;
  onDeleteWalletSettlement: (walletId: string, settlementId: string) => Promise<boolean>;
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

  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function isBudgetMonthInRange(month: string, range: BudgetHistoryRange): boolean {
  if (range === "all") {
    return true;
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return false;
  }

  const budgetDate = new Date(year, monthNumber - 1, 1);
  const currentDate = new Date();
  const currentMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthDiff = (currentMonthDate.getFullYear() - budgetDate.getFullYear()) * 12 + (currentMonthDate.getMonth() - budgetDate.getMonth());

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
  month: getCurrentMonthValue()
};

function parseMemberEntries(rawValue: string): Array<{ displayName: string; email?: string }> {
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
        email: email || undefined
      };
    });
}

export function WalletsPage({
  wallets,
  selectedWallet,
  selectedWalletId,
  currentUserId,
  budgetCategoryOptions,
  isLoading,
  isSubmitting,
  submittingAction,
  statusMessage,
  errorMessage,
  formatCurrency,
  onSelectWallet,
  onCreateWallet,
  onDeleteWallet,
  onLeaveWallet,
  onAddWalletMember,
  onRemoveWalletMember,
  onCreateWalletExpense,
  onUpdateWalletExpense,
  onDeleteWalletExpense,
  onCreateWalletBudget,
  onUpdateWalletBudget,
  onDeleteWalletBudget,
  onCreateWalletSettlement,
  onUpdateWalletSettlement,
  onDeleteWalletSettlement
}: WalletsPageProps) {
  const [walletName, setWalletName] = useState("");
  const [walletDescription, setWalletDescription] = useState("");
  const [walletMembersText, setWalletMembersText] = useState("");
  const [walletSplitRule, setWalletSplitRule] = useState<SplitRule>("equal");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayIsoDate());
  const [expenseSplitRule, setExpenseSplitRule] = useState<SplitRule>("equal");
  const [expensePayerId, setExpensePayerId] = useState("");
  const [selectedSplitMemberIds, setSelectedSplitMemberIds] = useState<string[]>([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [alreadySettledMemberIds, setAlreadySettledMemberIds] = useState<string[]>([]);
  const [editingWalletExpenseId, setEditingWalletExpenseId] = useState<string | null>(null);

  const [settlementFromMemberId, setSettlementFromMemberId] = useState("");
  const [settlementToMemberId, setSettlementToMemberId] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(getTodayIsoDate());
  const [settlementNote, setSettlementNote] = useState("");
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(null);
  const [deletingExpenseIds, setDeletingExpenseIds] = useState<string[]>([]);
  const [deletingSettlementIds, setDeletingSettlementIds] = useState<string[]>([]);
  const [isDeletingWallet, setIsDeletingWallet] = useState(false);
  const [isLeavingWallet, setIsLeavingWallet] = useState(false);
  const [removingMemberIds, setRemovingMemberIds] = useState<string[]>([]);
  const [isMobileExpenseModalOpen, setIsMobileExpenseModalOpen] = useState(false);
  const [isMobileSettlementModalOpen, setIsMobileSettlementModalOpen] = useState(false);
  const [walletBudgetForm, setWalletBudgetForm] = useState<BudgetForm>(initialWalletBudgetForm);
  const [editingWalletBudgetId, setEditingWalletBudgetId] = useState<string | null>(null);
  const [deletingWalletBudgetIds, setDeletingWalletBudgetIds] = useState<string[]>([]);
  const [walletBudgetHistoryRange, setWalletBudgetHistoryRange] = useState<BudgetHistoryRange>("half-year");
  const [isWalletBudgetHistoryOpen, setIsWalletBudgetHistoryOpen] = useState(false);
  const [walletBudgetStatusMessage, setWalletBudgetStatusMessage] = useState("");
  const [walletBudgetErrorMessage, setWalletBudgetErrorMessage] = useState("");

  const [showCreateWalletValidation, setShowCreateWalletValidation] = useState(false);
  const [showExpenseValidation, setShowExpenseValidation] = useState(false);
  const [showSettlementValidation, setShowSettlementValidation] = useState(false);
  const [showMemberValidation, setShowMemberValidation] = useState(false);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseFilterMonth, setExpenseFilterMonth] = useState("all");
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("all");
  const [expenseFilterAmount, setExpenseFilterAmount] = useState("all");

  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementFilterMonth, setSettlementFilterMonth] = useState("all");
  const [settlementFilterAmount, setSettlementFilterAmount] = useState("all");

  const createWalletErrors = useMemo(
    () => ({
      name: walletName.trim() ? "" : "Wallet name is required."
    }),
    [walletName]
  );

  const expenseErrors = useMemo(
    () => ({
      amount: expenseAmount.trim() ? "" : "Amount is required.",
      date: expenseDate.trim() ? "" : "Date is required.",
      category: expenseCategory.trim() ? "" : "Category is required.",
      description: expenseDescription.trim() ? "" : "Description is required."
    }),
    [expenseAmount, expenseDate, expenseCategory, expenseDescription]
  );

  const settlementErrors = useMemo(
    () => ({
      amount: settlementAmount.trim() ? "" : "Amount is required.",
      date: settlementDate.trim() ? "" : "Date is required."
    }),
    [settlementAmount, settlementDate]
  );

  const memberErrors = useMemo(
    () => ({
      displayName: inviteDisplayName.trim() ? "" : "Member name is required.",
      email: !inviteEmail.trim()
        ? "Email is required."
        : selectedWallet?.members.some((m) => m.email && m.email.toLowerCase() === inviteEmail.trim().toLowerCase())
          ? "A member with this email is already in this group."
          : ""
    }),
    [inviteDisplayName, inviteEmail, selectedWallet]
  );

  const walletBudgetCategoryChoices = useMemo(() => {
    const optionsByLabel = new Map<string, CategoryOption>();

    for (const option of budgetCategoryOptions) {
      optionsByLabel.set(option.label.toLowerCase(), option);
    }

    for (const expense of selectedWallet?.expenses ?? []) {
      const key = expense.category.toLowerCase();
      if (!optionsByLabel.has(key)) {
        optionsByLabel.set(key, {
          id: key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wallet-category",
          label: expense.category,
          icon: "other"
        });
      }
    }

    return [...optionsByLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [budgetCategoryOptions, selectedWallet]);

  const currentWalletMember = useMemo(
    () => selectedWallet?.members.find((member) => member.user_id === currentUserId) ?? null,
    [currentUserId, selectedWallet]
  );
  const isWalletOwner = currentWalletMember?.role === "owner";

  const walletBudgetSummaries = useMemo<BudgetSummary[]>(() => {
    if (!selectedWallet) {
      return [];
    }

    return selectedWallet.budgets
      .map((budget: WalletBudget) => {
        const spent = selectedWallet.expenses
          .filter((expense) => expense.date.slice(0, 7) === budget.month)
          .filter((expense) => (budget.scope === "category" ? expense.category === budget.category : true))
          .reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalBudgetAmount = Number(budget.amount);
        const remaining = totalBudgetAmount - spent;

        return {
          ...budget,
          spent,
          remaining,
          formattedAmount: formatCurrency(budget.amount),
          formattedSpent: formatCurrency(spent.toFixed(2)),
          formattedRemaining: formatCurrency(remaining.toFixed(2)),
          isOverspent: remaining < 0
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
  const currentWalletBudgetMonthLabel = formatBudgetMonth(currentWalletBudgetMonth);
  const currentMonthWalletBudgetSummaries = useMemo(
    () => walletBudgetSummaries.filter((budget) => budget.month === currentWalletBudgetMonth),
    [currentWalletBudgetMonth, walletBudgetSummaries]
  );

  const currentMonthWalletBudgetOverview = useMemo(() => {
    const totalBudgetAmount = currentMonthWalletBudgetSummaries.reduce((sum, budget) => sum + Number(budget.amount), 0);
    const totalSpentAmount = currentMonthWalletBudgetSummaries.reduce((sum, budget) => sum + budget.spent, 0);
    const totalRemainingAmount = totalBudgetAmount - totalSpentAmount;

    return {
      totalBudget: formatCurrency(totalBudgetAmount.toFixed(2)),
      totalSpent: formatCurrency(totalSpentAmount.toFixed(2)),
      totalRemaining: formatCurrency(totalRemainingAmount.toFixed(2)),
      isOverspent: totalRemainingAmount < 0
    };
  }, [currentMonthWalletBudgetSummaries, formatCurrency]);

  const walletBudgetHistoryGroups = useMemo(() => {
    const filteredBudgets = walletBudgetSummaries.filter((budget) => isBudgetMonthInRange(budget.month, walletBudgetHistoryRange));
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
        items
      }));
  }, [walletBudgetHistoryRange, walletBudgetSummaries]);

  const expenseMonthOptions = useMemo(() => {
    const months = new Set((selectedWallet?.expenses ?? []).map((e) => e.date.slice(0, 7)));
    return [...months].sort().reverse();
  }, [selectedWallet]);

  const expenseCategoryOptions = useMemo(() => {
    const cats = new Set((selectedWallet?.expenses ?? []).map((e) => e.category));
    return [...cats].sort();
  }, [selectedWallet]);

  const settlementMonthOptions = useMemo(() => {
    const months = new Set((selectedWallet?.settlements ?? []).map((s) => s.date.slice(0, 7)));
    return [...months].sort().reverse();
  }, [selectedWallet]);

  function filterByAmount<T extends { amount: string }>(items: T[], filter: string): T[] {
    if (filter === "all") return items;
    const num = (item: T) => Number(item.amount);
    if (filter === "lt100") return items.filter((i) => num(i) < 100);
    if (filter === "100to500") return items.filter((i) => num(i) >= 100 && num(i) <= 500);
    if (filter === "gt500") return items.filter((i) => num(i) > 500);
    return items;
  }

  const filteredExpenses = useMemo(() => {
    let items = selectedWallet?.expenses ?? [];
    if (expenseFilterMonth !== "all") items = items.filter((e) => e.date.slice(0, 7) === expenseFilterMonth);
    if (expenseFilterCategory !== "all") items = items.filter((e) => e.category === expenseFilterCategory);
    return filterByAmount(items, expenseFilterAmount);
  }, [selectedWallet, expenseFilterMonth, expenseFilterCategory, expenseFilterAmount]);

  const filteredSettlements = useMemo(() => {
    let items = selectedWallet?.settlements ?? [];
    if (settlementFilterMonth !== "all") items = items.filter((s) => s.date.slice(0, 7) === settlementFilterMonth);
    return filterByAmount(items, settlementFilterAmount);
  }, [selectedWallet, settlementFilterMonth, settlementFilterAmount]);

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
    setExpensePayerId((current) => (current && memberIds.includes(current) ? current : memberIds[0] ?? ""));
    setSelectedSplitMemberIds((current) => (current.length > 0 ? current.filter((memberId) => memberIds.includes(memberId)) : memberIds));
    setSettlementFromMemberId((current) => (current && memberIds.includes(current) ? current : memberIds[0] ?? ""));
    setSettlementToMemberId((current) => (current && memberIds.includes(current) ? current : memberIds[1] ?? memberIds[0] ?? ""));
    setInviteDisplayName("");
    setInviteEmail("");
    setEditingWalletExpenseId(null);
    setAlreadySettledMemberIds([]);
    setEditingSettlementId(null);
    setWalletBudgetForm({ ...initialWalletBudgetForm, month: getCurrentMonthValue() });
    setEditingWalletBudgetId(null);
    setDeletingWalletBudgetIds([]);
    setIsWalletBudgetHistoryOpen(false);
    setWalletBudgetStatusMessage("");
    setWalletBudgetErrorMessage("");
  }, [selectedWallet]);

  function handleWalletBudgetFormChange(updater: (current: BudgetForm) => BudgetForm) {
    setWalletBudgetForm((current) => {
      const nextBudgetForm = updater(current);

      if (nextBudgetForm.scope === "monthly") {
        return {
          ...nextBudgetForm,
          category: ""
        };
      }

      return nextBudgetForm;
    });
  }

  function handleToggleSplitMember(memberId: string) {
    setSelectedSplitMemberIds((current) => {
      if (current.includes(memberId)) {
        setAlreadySettledMemberIds((settled) => settled.filter((id) => id !== memberId));
        return current.filter((id) => id !== memberId);
      }

      return [...current, memberId];
    });
  }

  function handleToggleAlreadySettled(memberId: string) {
    setAlreadySettledMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
    );
  }

  async function handleCreateWalletSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowCreateWalletValidation(true);

    if (Object.values(createWalletErrors).some(Boolean)) {
      return;
    }

    const members = parseMemberEntries(walletMembersText);

    const created = await onCreateWallet({
      name: walletName,
      description: walletDescription,
      defaultSplitRule: walletSplitRule,
      members
    });

    if (created) {
      setWalletName("");
      setWalletDescription("");
      setWalletMembersText("");
      setWalletSplitRule("equal");
      setShowCreateWalletValidation(false);
    }
  }

  async function handleAddWalletMemberSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowMemberValidation(true);

    if (Object.values(memberErrors).some(Boolean)) {
      return;
    }

    if (!selectedWallet) {
      return;
    }

    const created = await onAddWalletMember(selectedWallet.wallet.id, {
      displayName: inviteDisplayName,
      email: inviteEmail || undefined
    });

    if (created) {
      setInviteDisplayName("");
      setInviteEmail("");
      setShowMemberValidation(false);
    }
  }

  async function handleCreateWalletExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowExpenseValidation(true);

    if (Object.values(expenseErrors).some(Boolean)) {
      return;
    }

    if (!selectedWallet) {
      return;
    }

    const normalizedMemberIds = [...new Set([...selectedSplitMemberIds, expensePayerId].filter(Boolean))];
    const splits = normalizedMemberIds.map((memberId) => ({
      memberId,
      value: expenseSplitRule === "equal" ? undefined : splitValues[memberId] ?? ""
    }));

    const payload = {
      paidByMemberId: expensePayerId,
      amount: expenseAmount,
      category: expenseCategory,
      description: expenseDescription,
      date: expenseDate,
      splitRule: expenseSplitRule,
      splits
    };

    const created = editingWalletExpenseId ? await onUpdateWalletExpense(selectedWallet.wallet.id, editingWalletExpenseId, payload) : await onCreateWalletExpense(selectedWallet.wallet.id, payload);

    if (created) {
      // Auto-create settlements for members marked as "already settled" (new expenses only)
      const settledNonPayers = !editingWalletExpenseId ? alreadySettledMemberIds.filter((id) => id !== expensePayerId && normalizedMemberIds.includes(id)) : [];

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
              note: `Auto-settled: ${expenseDescription}`
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
      setShowExpenseValidation(false);
      setIsMobileExpenseModalOpen(false);
    }
  }

  async function handleCreateSettlementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowSettlementValidation(true);

    if (Object.values(settlementErrors).some(Boolean)) {
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
      note: settlementNote
    };

    const created = editingSettlementId ? await onUpdateWalletSettlement(selectedWallet.wallet.id, editingSettlementId, payload) : await onCreateWalletSettlement(selectedWallet.wallet.id, payload);

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
      month: budget.month
    });
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");
    setIsWalletBudgetHistoryOpen(false);
  }

  function handleWalletBudgetEditCancel() {
    setEditingWalletBudgetId(null);
    setWalletBudgetForm({ ...initialWalletBudgetForm, month: getCurrentMonthValue() });
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");
  }

  async function handleWalletBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWallet) {
      return;
    }

    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");

    const succeeded = editingWalletBudgetId
      ? await onUpdateWalletBudget(selectedWallet.wallet.id, editingWalletBudgetId, walletBudgetForm)
      : await onCreateWalletBudget(selectedWallet.wallet.id, walletBudgetForm);

    if (!succeeded) {
      setWalletBudgetErrorMessage(editingWalletBudgetId ? "Failed to update wallet budget." : "Failed to save wallet budget.");
      return;
    }

    setEditingWalletBudgetId(null);
    setWalletBudgetForm({ ...initialWalletBudgetForm, month: getCurrentMonthValue() });
    setWalletBudgetStatusMessage(editingWalletBudgetId ? "Group budget updated." : "Group budget saved.");
  }

  async function handleWalletBudgetDelete(walletBudgetId: string) {
    if (!selectedWallet || !window.confirm("Delete this group budget permanently?")) {
      return;
    }

    setDeletingWalletBudgetIds((current) => [...new Set([...current, walletBudgetId])]);
    setWalletBudgetErrorMessage("");
    setWalletBudgetStatusMessage("");

    try {
      const deleted = await onDeleteWalletBudget(selectedWallet.wallet.id, walletBudgetId);

      if (!deleted) {
        setWalletBudgetErrorMessage("Failed to delete wallet budget.");
        return;
      }

      if (editingWalletBudgetId === walletBudgetId) {
        setEditingWalletBudgetId(null);
        setWalletBudgetForm({ ...initialWalletBudgetForm, month: getCurrentMonthValue() });
      }

      setWalletBudgetStatusMessage("Group budget deleted.");
    } finally {
      setDeletingWalletBudgetIds((current) => current.filter((id) => id !== walletBudgetId));
    }
  }

  function handleStartExpenseEdit(walletExpenseId: string) {
    const walletExpense = selectedWallet?.expenses.find((expense) => expense.id === walletExpenseId);

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
    setSelectedSplitMemberIds(walletExpense.splits.map((split) => split.member_id));
    setSplitValues(Object.fromEntries(walletExpense.splits.map((split) => [split.member_id, split.percentage === null ? split.amount : split.percentage.toString()])));
    setAlreadySettledMemberIds([]);

    if (window.innerWidth < 1536) {
      setIsMobileExpenseModalOpen(true);
    }
  }

  async function handleDeleteExpenseClick(walletExpenseId: string) {
    if (!selectedWallet || !window.confirm("Delete this shared expense?")) {
      return;
    }

    setDeletingExpenseIds((current) => [...new Set([...current, walletExpenseId])]);

    try {
      const deleted = await onDeleteWalletExpense(selectedWallet.wallet.id, walletExpenseId);

      if (deleted && editingWalletExpenseId === walletExpenseId) {
        setEditingWalletExpenseId(null);
        setAlreadySettledMemberIds([]);
        setExpenseAmount("");
        setExpenseCategory("");
        setExpenseDescription("");
        setExpenseDate(getTodayIsoDate());
        setSplitValues({});
      }
    } finally {
      setDeletingExpenseIds((current) => current.filter((id) => id !== walletExpenseId));
    }
  }

  function handleStartSettlementEdit(settlementId: string) {
    const settlement = selectedWallet?.settlements.find((entry) => entry.id === settlementId);

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

    setDeletingSettlementIds((current) => [...new Set([...current, settlementId])]);

    try {
      const deleted = await onDeleteWalletSettlement(selectedWallet.wallet.id, settlementId);

      if (deleted && editingSettlementId === settlementId) {
        setEditingSettlementId(null);
        setSettlementAmount("");
        setSettlementDate(getTodayIsoDate());
        setSettlementNote("");
      }
    } finally {
      setDeletingSettlementIds((current) => current.filter((id) => id !== settlementId));
    }
  }

  async function handleDeleteWalletClick() {
    if (!selectedWallet || !window.confirm(`Delete ${selectedWallet.wallet.name} and all its shared data?`)) {
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
    if (!selectedWallet || !window.confirm(`Exit ${selectedWallet.wallet.name}? You will lose access to this group.`)) {
      return;
    }

    setIsLeavingWallet(true);
    try {
      await onLeaveWallet(selectedWallet.wallet.id);
    } finally {
      setIsLeavingWallet(false);
    }
  }

  function renderWalletExpenseForm() {
    return (
      <form className="grid gap-4" onSubmit={handleCreateWalletExpenseSubmit} noValidate>
        <label className="grid gap-2 text-sm font-medium text-secondary">
          Paid by
          <select value={expensePayerId} onChange={(event) => setExpensePayerId(event.target.value)}>
            {selectedWallet!.members.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Amount</span>
            <input value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0.00" required aria-invalid={showExpenseValidation && Boolean(expenseErrors.amount)} />
            {showExpenseValidation && expenseErrors.amount ? <span className="text-sm text-[color:var(--danger-text)]">{expenseErrors.amount}</span> : null}
          </label>
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Date</span>
            <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required aria-invalid={showExpenseValidation && Boolean(expenseErrors.date)} />
            {showExpenseValidation && expenseErrors.date ? <span className="text-sm text-[color:var(--danger-text)]">{expenseErrors.date}</span> : null}
          </label>
        </div>

        <div className="grid gap-2 text-sm font-medium text-secondary">
          <span className="required-mark">Category</span>
          <div className="flex items-center gap-3">
            {expenseCategory ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-ink shadow-sm">
                <CategoryIcon iconId={walletBudgetCategoryChoices.find((option) => option.label === expenseCategory)?.icon ?? "other"} />
              </span>
            ) : null}
            <select
              value={expenseCategory}
              onChange={(event) => setExpenseCategory(event.target.value)}
              required
              aria-invalid={showExpenseValidation && Boolean(expenseErrors.category)}
            >
              <option value="">Select a category</option>
              {walletBudgetCategoryChoices.map((option) => (
                <option key={option.id} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {showExpenseValidation && expenseErrors.category ? <span className="text-sm text-[color:var(--danger-text)]">{expenseErrors.category}</span> : null}
        </div>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          <span className="required-mark">Description</span>
          <input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Hotel, groceries, tickets" required aria-invalid={showExpenseValidation && Boolean(expenseErrors.description)} />
          {showExpenseValidation && expenseErrors.description ? <span className="text-sm text-[color:var(--danger-text)]">{expenseErrors.description}</span> : null}
        </label>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          Split rule
          <select value={expenseSplitRule} onChange={(event) => setExpenseSplitRule(event.target.value as SplitRule)}>
            <option value="equal">Equal</option>
            <option value="fixed">Fixed amounts</option>
            <option value="percentage">Percentages</option>
          </select>
        </label>

        <div className="space-y-3 rounded-[24px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
          <p className="section-eyebrow">Split members</p>
          <div className="grid gap-3">
            {selectedWallet!.members.map((member) => {
              const isSelected = selectedSplitMemberIds.includes(member.id);
              const needsValue = expenseSplitRule !== "equal" && isSelected;
              const canMarkSettled = isSelected && member.id !== expensePayerId && !editingWalletExpenseId;
              const isSettled = alreadySettledMemberIds.includes(member.id);

              return (
                <div key={member.id} className={cn("rounded-[18px] border p-3 transition-colors", isSettled ? "border-primary/20 bg-success-tint" : "border-[color:var(--border)] bg-white/85")}>
                  <label className="grid cursor-pointer gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(110px,140px)] sm:items-center">
                    <input type="checkbox" checked={isSelected} onChange={() => handleToggleSplitMember(member.id)} />
                    <span className="text-sm font-semibold text-ink">{member.display_name}</span>
                    {needsValue ? (
                      <input
                        value={splitValues[member.id] ?? ""}
                        onChange={(event) => setSplitValues((current) => ({ ...current, [member.id]: event.target.value }))}
                        placeholder={expenseSplitRule === "fixed" ? "0.00" : "%"}
                      />
                    ) : <span className="text-sm text-muted">{isSelected ? "Included" : "Excluded"}</span>}
                  </label>
                  {canMarkSettled ? (
                    <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-[color:var(--border)] pt-3 text-xs font-medium text-secondary">
                      <input type="checkbox" checked={isSettled} onChange={() => handleToggleAlreadySettled(member.id)} />
                      <span className={isSettled ? "text-ink" : "text-muted"}>
                        {isSettled ? "✓ Already settled their share" : "Already settled their share?"}
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
            <button type="button" className="ui-button-secondary" onClick={() => { setEditingWalletExpenseId(null); setIsMobileExpenseModalOpen(false); }}>Cancel edit</button>
          ) : null}
          <button type="submit" className="ui-button-primary" disabled={isSubmitting}>
            {submittingAction === "expense" ? "Saving..." : editingWalletExpenseId ? "Update shared expense" : "Add shared expense"}
          </button>
        </div>
      </form>
    );
  }

  function renderSettlementForm() {
    return (
      <form className="grid gap-4" onSubmit={handleCreateSettlementSubmit} noValidate>
        <label className="grid gap-2 text-sm font-medium text-secondary">
          From member
          <select value={settlementFromMemberId} onChange={(event) => setSettlementFromMemberId(event.target.value)}>
            {selectedWallet!.members.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          To member
          <select value={settlementToMemberId} onChange={(event) => setSettlementToMemberId(event.target.value)}>
            {selectedWallet!.members.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Amount</span>
            <input value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} placeholder="0.00" required aria-invalid={showSettlementValidation && Boolean(settlementErrors.amount)} />
            {showSettlementValidation && settlementErrors.amount ? <span className="text-sm text-[color:var(--danger-text)]">{settlementErrors.amount}</span> : null}
          </label>
          <label className="grid gap-2 text-sm font-medium text-secondary">
            <span className="required-mark">Date</span>
            <input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} required aria-invalid={showSettlementValidation && Boolean(settlementErrors.date)} />
            {showSettlementValidation && settlementErrors.date ? <span className="text-sm text-[color:var(--danger-text)]">{settlementErrors.date}</span> : null}
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium text-secondary">
          Note
          <input value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} placeholder="Optional note" />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {editingSettlementId ? (
            <button type="button" className="ui-button-secondary" onClick={() => { setEditingSettlementId(null); setIsMobileSettlementModalOpen(false); }}>Cancel edit</button>
          ) : null}
          <button type="submit" className="ui-button-primary" disabled={isSubmitting}>
            {submittingAction === "settlement" ? "Saving..." : editingSettlementId ? "Update settlement" : "Record settlement"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="Shared wallets"
        title="Track group spending, balances, and settlements."
        description="Create a wallet for a trip, home, or shared budget, then manage balances, group budgets, transactions, invites, and payback history in one connected surface."
      />

      {statusMessage ? <StatusNotice tone="success">{statusMessage}</StatusNotice> : null}
      {errorMessage ? <StatusNotice tone="error">{errorMessage}</StatusNotice> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(280px,0.36fr)_minmax(0,0.64fr)]">
        <SurfaceCard className="space-y-6 p-5 sm:p-6 xl:sticky xl:top-32 xl:self-start">
          <SectionHeader eyebrow="Your wallets" title="Groups and shared ledgers" description="Switch between wallets and create a new shared group from the same persistent rail." />

          {wallets.length === 0 ? (
            <EmptyState title="No wallets yet" description="Create your first shared wallet to start tracking group spending, shared budgets, and settlements." />
          ) : (
            <div className="grid gap-3">
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  className={cn(
                    "rounded-[22px] border px-4 py-4 text-left shadow-sm",
                    wallet.id === selectedWalletId ? "border-primary/25 bg-success-tint text-ink" : "border-[color:var(--border)] bg-white/80 text-secondary hover:bg-white"
                  )}
                  onClick={() => onSelectWallet(wallet.id)}
                >
                  <strong className="block text-base text-ink">{wallet.name}</strong>
                  <span className="mt-1 block text-sm leading-6 text-secondary">{wallet.description || "No description yet."}</span>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,243,232,0.8))] p-4 sm:p-5">
            <SectionHeader eyebrow="Create wallet" title="New shared group" description="Invite housemates, travel partners, or family members with a split rule that fits the group." />
            <form className="mt-5 grid gap-4" onSubmit={handleCreateWalletSubmit} noValidate>
              <label className="grid gap-2 text-sm font-medium text-secondary">
                <span className="required-mark">Wallet name</span>
                <input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Apartment essentials" required aria-invalid={showCreateWalletValidation && Boolean(createWalletErrors.name)} />
                {showCreateWalletValidation && createWalletErrors.name ? <span className="text-sm text-[color:var(--danger-text)]">{createWalletErrors.name}</span> : null}
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Description
                <textarea value={walletDescription} onChange={(event) => setWalletDescription(event.target.value)} rows={3} placeholder="What this wallet is for" />
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Default split rule
                <select value={walletSplitRule} onChange={(event) => setWalletSplitRule(event.target.value as SplitRule)}>
                  <option value="equal">Equal</option>
                  <option value="fixed">Fixed amounts</option>
                  <option value="percentage">Percentages</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Members
                <textarea value={walletMembersText} onChange={(event) => setWalletMembersText(event.target.value)} rows={4} placeholder="One name per line or comma separated" />
              </label>

              <button type="submit" className="ui-button-primary justify-center" disabled={isSubmitting}>
                {submittingAction === "create-wallet" ? "Saving..." : "Create wallet"}
              </button>
            </form>
          </div>
        </SurfaceCard>

        <section className="grid gap-5">
          {isLoading ? <StatusNotice tone="neutral">Loading wallet data...</StatusNotice> : null}

          {!isLoading && !selectedWallet ? <EmptyState title="Select a wallet" description="Choose a wallet to view members, balances, shared expenses, settlements, and wallet-specific budgets." /> : null}

          {selectedWallet ? (
            <>
              <SurfaceCard className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  eyebrow="Selected wallet"
                  title={selectedWallet.wallet.name}
                  description={selectedWallet.wallet.description || "No description provided for this wallet yet."}
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="data-pill">{selectedWallet.wallet.default_split_rule} split by default</span>
                      {isWalletOwner ? (
                        <button type="button" className="ui-button-danger" onClick={() => void handleDeleteWalletClick()} disabled={isSubmitting || isDeletingWallet}>
                          {isDeletingWallet ? "Deleting..." : "Delete group"}
                        </button>
                      ) : currentWalletMember ? (
                        <button type="button" className="ui-button-danger" onClick={() => void handleLeaveWalletClick()} disabled={isSubmitting || isLeavingWallet}>
                          {isLeavingWallet ? "Leaving..." : "Exit group"}
                        </button>
                      ) : null}
                    </div>
                  }
                />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedWallet.members.map((member) => (
                    <article key={member.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="block text-base text-ink">{member.display_name}</strong>
                          <p className="mt-1 text-sm text-secondary">{member.role}{member.invite_status === "pending" ? " • invite pending" : ""}</p>
                        </div>
                        {isWalletOwner && member.role !== "owner" ? (
                          <button
                            type="button"
                            className="ui-button-danger !p-1.5"
                            disabled={isSubmitting || removingMemberIds.includes(member.id)}
                            onClick={() => { if (confirm(`Remove ${member.display_name} from this group?`)) { setRemovingMemberIds((c) => [...new Set([...c, member.id])]); onRemoveWalletMember(selectedWallet.wallet.id, member.id).finally(() => setRemovingMemberIds((c) => c.filter((id) => id !== member.id))); } }}
                            title="Remove member"
                          >
                            {removingMemberIds.includes(member.id) ? (
                              <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <form className="grid gap-3" onSubmit={handleAddWalletMemberSubmit} noValidate>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div className="grid gap-2">
                      <input value={inviteDisplayName} onChange={(event) => setInviteDisplayName(event.target.value)} placeholder="Invite member name *" required aria-invalid={showMemberValidation && Boolean(memberErrors.displayName)} />
                      {showMemberValidation && memberErrors.displayName ? <span className="text-sm text-[color:var(--danger-text)]">{memberErrors.displayName}</span> : null}
                    </div>
                    <div className="grid gap-2">
                      <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Email to link existing user *" required aria-invalid={showMemberValidation && Boolean(memberErrors.email)} />
                      {showMemberValidation && memberErrors.email ? <span className="text-sm text-[color:var(--danger-text)]">{memberErrors.email}</span> : null}
                    </div>
                    <button type="submit" className="ui-button-secondary justify-center" disabled={isSubmitting}>
                      {submittingAction === "member" ? "Saving..." : "Add member"}
                    </button>
                  </div>
                </form>
              </SurfaceCard>

              <SurfaceCard className="space-y-5 p-5 sm:p-6">
                <SectionHeader eyebrow="Balances" title="Who should receive and who owes" description="Live net balances keep the group aware of who is owed and who still needs to settle." />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedWallet.balances.map((balance) => {
                    const numericBalance = Number(balance.net_amount);

                    return (
                      <article
                        key={balance.member_id}
                        className={cn(
                          "rounded-[24px] border p-5 shadow-sm",
                          numericBalance > 0
                            ? "border-primary/12 bg-success-tint"
                            : numericBalance < 0
                              ? "border-[color:rgba(154,63,56,0.14)] bg-danger-tint"
                              : "border-[color:var(--border)] bg-white/80"
                        )}
                      >
                        <strong className="block text-lg text-ink">{balance.member_name}</strong>
                        <span className="mt-2 block text-sm text-secondary">{numericBalance > 0 ? "Should receive" : numericBalance < 0 ? "Needs to settle" : "Square"}</span>
                        <h4 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink">{formatCurrency(Math.abs(numericBalance).toFixed(2))}</h4>
                      </article>
                    );
                  })}
                </div>
              </SurfaceCard>

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

              <section className="grid gap-5 2xl:grid-cols-2">
                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Shared expense" title={editingWalletExpenseId ? "Edit group transaction" : "Add a group transaction"} description="Capture a shared purchase, choose the payer, and define how the split should be distributed across members." />
                  {renderWalletExpenseForm()}
                </SurfaceCard>

                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Settlement" title={editingSettlementId ? "Edit payback" : "Record a payback"} description="Log repayments to keep group balances current and the shared ledger easy to reconcile." />
                  {renderSettlementForm()}
                </SurfaceCard>
              </section>

              <section className="grid gap-5 2xl:grid-cols-2">
                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Shared expenses" title="Recent group activity" description="The latest shared purchases inside this wallet." />
                  {selectedWallet.expenses.length === 0 ? (
                    <EmptyState title="No shared expenses yet" description="Add the first group transaction to start tracking how this wallet is being used." />
                  ) : (
                    <>
                      <div className="grid gap-3">
                        {selectedWallet.expenses.slice(0, 5).map((expense) => (
                          <article key={expense.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1.5">
                                <strong className="block text-base text-ink">{expense.description}</strong>
                                <p className="text-sm leading-6 text-secondary">{expense.category} · paid by {expense.paid_by_member_name} · {expense.date}</p>
                              </div>
                              <div className="text-left lg:text-right">
                                <strong className="block text-xl text-ink">{formatCurrency(expense.amount)}</strong>
                                <span className="text-sm text-secondary">{expense.split_rule} split</span>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" className="ui-button-ghost" onClick={() => handleStartExpenseEdit(expense.id)}>Edit</button>
                              <button type="button" className="ui-button-danger" disabled={deletingExpenseIds.includes(expense.id)} onClick={() => void handleDeleteExpenseClick(expense.id)}>{deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {selectedWallet.expenses.length > 5 ? (
                        <button type="button" className="ui-button-secondary w-full justify-center" onClick={() => { setExpenseFilterMonth("all"); setExpenseFilterCategory("all"); setExpenseFilterAmount("all"); setIsExpenseModalOpen(true); }}>
                          Show all {selectedWallet.expenses.length} expenses
                        </button>
                      ) : null}
                    </>
                  )}
                </SurfaceCard>

                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Settlements" title="Payback history" description="See who repaid whom and keep the group record clean." />
                  {selectedWallet.settlements.length === 0 ? (
                    <EmptyState title="No settlements yet" description="Record a payback once members start settling balances inside this wallet." />
                  ) : (
                    <>
                      <div className="grid gap-3">
                        {selectedWallet.settlements.slice(0, 5).map((settlement) => (
                          <article key={settlement.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1.5">
                                <strong className="block text-base text-ink">{settlement.from_member_name} paid {settlement.to_member_name}</strong>
                                <p className="text-sm leading-6 text-secondary">{settlement.date}{settlement.note ? ` · ${settlement.note}` : ""}</p>
                              </div>
                              <strong className="text-xl text-ink">{formatCurrency(settlement.amount)}</strong>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" className="ui-button-ghost" onClick={() => handleStartSettlementEdit(settlement.id)}>Edit</button>
                              <button type="button" className="ui-button-danger" disabled={deletingSettlementIds.includes(settlement.id)} onClick={() => void handleDeleteSettlementClick(settlement.id)}>{deletingSettlementIds.includes(settlement.id) ? "Deleting..." : "Delete"}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {selectedWallet.settlements.length > 5 ? (
                        <button type="button" className="ui-button-secondary w-full justify-center" onClick={() => { setSettlementFilterMonth("all"); setSettlementFilterAmount("all"); setIsSettlementModalOpen(true); }}>
                          Show all {selectedWallet.settlements.length} settlements
                        </button>
                      ) : null}
                    </>
                  )}
                </SurfaceCard>
              </section>

              {isExpenseModalOpen ? (
                <ModalFrame onClose={() => setIsExpenseModalOpen(false)} className="flex max-h-[88vh] flex-col p-0">
                  <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink sm:text-[2rem]">All shared expenses</h2>
                        <p className="text-sm leading-7 text-secondary">{filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""} found</p>
                      </div>
                      <button type="button" className="ui-button-secondary shrink-0" onClick={() => setIsExpenseModalOpen(false)}>Close</button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1.5 text-xs font-medium text-secondary">
                        Month
                        <select value={expenseFilterMonth} onChange={(e) => setExpenseFilterMonth(e.target.value)}>
                          <option value="all">All months</option>
                          {expenseMonthOptions.map((m) => <option key={m} value={m}>{formatBudgetMonth(m)}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium text-secondary">
                        Category
                        <select value={expenseFilterCategory} onChange={(e) => setExpenseFilterCategory(e.target.value)}>
                          <option value="all">All categories</option>
                          {expenseCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium text-secondary">
                        Amount
                        <select value={expenseFilterAmount} onChange={(e) => setExpenseFilterAmount(e.target.value)}>
                          <option value="all">Any amount</option>
                          <option value="lt100">Under 100</option>
                          <option value="100to500">100 – 500</option>
                          <option value="gt500">Over 500</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    {filteredExpenses.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted">No expenses match the current filters.</p>
                    ) : (
                      <div className="grid gap-3">
                        {filteredExpenses.map((expense) => (
                          <article key={expense.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 space-y-1.5">
                                <strong className="block truncate text-base text-ink">{expense.description}</strong>
                                <p className="text-sm leading-6 text-secondary">{expense.category} · paid by {expense.paid_by_member_name} · {expense.date}</p>
                              </div>
                              <div className="shrink-0 text-left sm:text-right">
                                <strong className="block text-xl text-ink">{formatCurrency(expense.amount)}</strong>
                                <span className="text-sm text-secondary">{expense.split_rule} split</span>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" className="ui-button-ghost" onClick={() => { handleStartExpenseEdit(expense.id); setIsExpenseModalOpen(false); }}>Edit</button>
                              <button type="button" className="ui-button-danger" disabled={deletingExpenseIds.includes(expense.id)} onClick={() => void handleDeleteExpenseClick(expense.id)}>{deletingExpenseIds.includes(expense.id) ? "Deleting..." : "Delete"}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </ModalFrame>
              ) : null}

              {isSettlementModalOpen ? (
                <ModalFrame onClose={() => setIsSettlementModalOpen(false)} className="flex max-h-[88vh] flex-col p-0">
                  <div className="border-b border-[color:var(--border)] px-5 py-5 sm:px-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <h2 className="font-display text-2xl leading-none tracking-[-0.03em] text-ink sm:text-[2rem]">All settlements</h2>
                        <p className="text-sm leading-7 text-secondary">{filteredSettlements.length} settlement{filteredSettlements.length !== 1 ? "s" : ""} found</p>
                      </div>
                      <button type="button" className="ui-button-secondary shrink-0" onClick={() => setIsSettlementModalOpen(false)}>Close</button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs font-medium text-secondary">
                        Month
                        <select value={settlementFilterMonth} onChange={(e) => setSettlementFilterMonth(e.target.value)}>
                          <option value="all">All months</option>
                          {settlementMonthOptions.map((m) => <option key={m} value={m}>{formatBudgetMonth(m)}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium text-secondary">
                        Amount
                        <select value={settlementFilterAmount} onChange={(e) => setSettlementFilterAmount(e.target.value)}>
                          <option value="all">Any amount</option>
                          <option value="lt100">Under 100</option>
                          <option value="100to500">100 – 500</option>
                          <option value="gt500">Over 500</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    {filteredSettlements.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted">No settlements match the current filters.</p>
                    ) : (
                      <div className="grid gap-3">
                        {filteredSettlements.map((settlement) => (
                          <article key={settlement.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 space-y-1.5">
                                <strong className="block truncate text-base text-ink">{settlement.from_member_name} paid {settlement.to_member_name}</strong>
                                <p className="text-sm leading-6 text-secondary">{settlement.date}{settlement.note ? ` · ${settlement.note}` : ""}</p>
                              </div>
                              <strong className="shrink-0 text-xl text-ink">{formatCurrency(settlement.amount)}</strong>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" className="ui-button-ghost" onClick={() => { handleStartSettlementEdit(settlement.id); setIsSettlementModalOpen(false); }}>Edit</button>
                              <button type="button" className="ui-button-danger" disabled={deletingSettlementIds.includes(settlement.id)} onClick={() => void handleDeleteSettlementClick(settlement.id)}>{deletingSettlementIds.includes(settlement.id) ? "Deleting..." : "Delete"}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </ModalFrame>
              ) : null}
            </>
          ) : null}
        </section>
      </section>

      {isMobileExpenseModalOpen ? (
        <ModalFrame onClose={() => { setEditingWalletExpenseId(null); setIsMobileExpenseModalOpen(false); }} className="flex max-h-[92vh] flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">Edit group transaction</h2>
              <button type="button" className="ui-button-secondary" onClick={() => { setEditingWalletExpenseId(null); setIsMobileExpenseModalOpen(false); }}>Cancel</button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5">{renderWalletExpenseForm()}</div>
        </ModalFrame>
      ) : null}

      {isMobileSettlementModalOpen ? (
        <ModalFrame onClose={() => { setEditingSettlementId(null); setIsMobileSettlementModalOpen(false); }} className="flex max-h-[92vh] flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">Edit payback</h2>
              <button type="button" className="ui-button-secondary" onClick={() => { setEditingSettlementId(null); setIsMobileSettlementModalOpen(false); }}>Cancel</button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5">{renderSettlementForm()}</div>
        </ModalFrame>
      ) : null}
    </>
  );
}