import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BudgetTrackerSection } from "../components/BudgetTrackerSection";
import { CategoryIcon } from "../components/CategoryIcon";
import { EmptyState, PageHero, SectionHeader, StatusNotice, SurfaceCard, cn } from "../components/ui";
import type { BudgetForm, BudgetHistoryRange, BudgetSummary, CategoryOption, SplitRule, Wallet, WalletDetail, WalletBudget } from "../types";

type WalletsPageProps = {
  wallets: Wallet[];
  selectedWallet: WalletDetail | null;
  selectedWalletId: string | null;
  currentUserId: string | null;
  budgetCategoryOptions: CategoryOption[];
  isLoading: boolean;
  isSubmitting: boolean;
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
  const [editingWalletExpenseId, setEditingWalletExpenseId] = useState<string | null>(null);

  const [settlementFromMemberId, setSettlementFromMemberId] = useState("");
  const [settlementToMemberId, setSettlementToMemberId] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(getTodayIsoDate());
  const [settlementNote, setSettlementNote] = useState("");
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(null);
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
        return current.filter((id) => id !== memberId);
      }

      return [...current, memberId];
    });
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
      setExpenseAmount("");
      setExpenseCategory("");
      setExpenseDescription("");
      setExpenseDate(getTodayIsoDate());
      setExpenseSplitRule(selectedWallet.wallet.default_split_rule);
      setSplitValues({});
      setEditingWalletExpenseId(null);
      setShowExpenseValidation(false);
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
  }

  async function handleDeleteExpenseClick(walletExpenseId: string) {
    if (!selectedWallet || !window.confirm("Delete this shared expense?")) {
      return;
    }

    const deleted = await onDeleteWalletExpense(selectedWallet.wallet.id, walletExpenseId);

    if (deleted && editingWalletExpenseId === walletExpenseId) {
      setEditingWalletExpenseId(null);
      setExpenseAmount("");
      setExpenseCategory("");
      setExpenseDescription("");
      setExpenseDate(getTodayIsoDate());
      setSplitValues({});
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
  }

  async function handleDeleteSettlementClick(settlementId: string) {
    if (!selectedWallet || !window.confirm("Delete this settlement?")) {
      return;
    }

    const deleted = await onDeleteWalletSettlement(selectedWallet.wallet.id, settlementId);

    if (deleted && editingSettlementId === settlementId) {
      setEditingSettlementId(null);
      setSettlementAmount("");
      setSettlementDate(getTodayIsoDate());
      setSettlementNote("");
    }
  }

  async function handleDeleteWalletClick() {
    if (!selectedWallet || !window.confirm(`Delete ${selectedWallet.wallet.name} and all its shared data?`)) {
      return;
    }

    await onDeleteWallet(selectedWallet.wallet.id);
  }

  async function handleLeaveWalletClick() {
    if (!selectedWallet || !window.confirm(`Exit ${selectedWallet.wallet.name}? You will lose access to this group.`)) {
      return;
    }

    await onLeaveWallet(selectedWallet.wallet.id);
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
                {isSubmitting ? "Saving..." : "Create wallet"}
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
                        <button type="button" className="ui-button-danger" onClick={() => void handleDeleteWalletClick()} disabled={isSubmitting}>
                          Delete group
                        </button>
                      ) : currentWalletMember ? (
                        <button type="button" className="ui-button-danger" onClick={() => void handleLeaveWalletClick()} disabled={isSubmitting}>
                          Exit group
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
                            disabled={isSubmitting}
                            onClick={() => { if (confirm(`Remove ${member.display_name} from this group?`)) { void onRemoveWalletMember(selectedWallet.wallet.id, member.id); } }}
                            title="Remove member"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                            </svg>
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
                      {isSubmitting ? "Saving..." : "Add member"}
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
                isBudgetSubmitting={isSubmitting}
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

                  <form className="grid gap-4" onSubmit={handleCreateWalletExpenseSubmit} noValidate>
                    <label className="grid gap-2 text-sm font-medium text-secondary">
                      Paid by
                      <select value={expensePayerId} onChange={(event) => setExpensePayerId(event.target.value)}>
                        {selectedWallet.members.map((member) => (
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
                        {selectedWallet.members.map((member) => {
                          const isSelected = selectedSplitMemberIds.includes(member.id);
                          const needsValue = expenseSplitRule !== "equal" && isSelected;

                          return (
                            <label key={member.id} className="grid gap-3 rounded-[18px] border border-[color:var(--border)] bg-white/85 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(110px,140px)] sm:items-center">
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
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {editingWalletExpenseId ? <button type="button" className="ui-button-secondary" onClick={() => setEditingWalletExpenseId(null)}>Cancel edit</button> : null}
                      <button type="submit" className="ui-button-primary" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : editingWalletExpenseId ? "Update shared expense" : "Add shared expense"}
                      </button>
                    </div>
                  </form>
                </SurfaceCard>

                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Settlement" title={editingSettlementId ? "Edit payback" : "Record a payback"} description="Log repayments to keep group balances current and the shared ledger easy to reconcile." />

                  <form className="grid gap-4" onSubmit={handleCreateSettlementSubmit} noValidate>
                    <label className="grid gap-2 text-sm font-medium text-secondary">
                      From member
                      <select value={settlementFromMemberId} onChange={(event) => setSettlementFromMemberId(event.target.value)}>
                        {selectedWallet.members.map((member) => (
                          <option key={member.id} value={member.id}>{member.display_name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-secondary">
                      To member
                      <select value={settlementToMemberId} onChange={(event) => setSettlementToMemberId(event.target.value)}>
                        {selectedWallet.members.map((member) => (
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
                      {editingSettlementId ? <button type="button" className="ui-button-secondary" onClick={() => setEditingSettlementId(null)}>Cancel edit</button> : null}
                      <button type="submit" className="ui-button-primary" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : editingSettlementId ? "Update settlement" : "Record settlement"}
                      </button>
                    </div>
                  </form>
                </SurfaceCard>
              </section>

              <section className="grid gap-5 2xl:grid-cols-2">
                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Shared expenses" title="Recent group activity" description="The latest shared purchases inside this wallet." />
                  {selectedWallet.expenses.length === 0 ? (
                    <EmptyState title="No shared expenses yet" description="Add the first group transaction to start tracking how this wallet is being used." />
                  ) : (
                    <div className="grid gap-3">
                      {selectedWallet.expenses.map((expense) => (
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
                            <button type="button" className="ui-button-danger" onClick={() => void handleDeleteExpenseClick(expense.id)}>Delete</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </SurfaceCard>

                <SurfaceCard className="space-y-5 p-5 sm:p-6">
                  <SectionHeader eyebrow="Settlements" title="Payback history" description="See who repaid whom and keep the group record clean." />
                  {selectedWallet.settlements.length === 0 ? (
                    <EmptyState title="No settlements yet" description="Record a payback once members start settling balances inside this wallet." />
                  ) : (
                    <div className="grid gap-3">
                      {selectedWallet.settlements.map((settlement) => (
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
                            <button type="button" className="ui-button-danger" onClick={() => void handleDeleteSettlementClick(settlement.id)}>Delete</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </SurfaceCard>
              </section>
            </>
          ) : null}
        </section>
      </section>
    </>
  );
}