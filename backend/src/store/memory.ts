import { randomUUID } from "node:crypto";
import { formatMinorUnits } from "../lib/money.js";
import { createExpenseRequestHash } from "../lib/request-hash.js";
import type {
  CreateBillReminderInput,
  CreateBudgetInput,
  CreateExpenseInput,
  CreateReminderPreferencesInput,
  CreateSettlementInput,
  CreateWalletMemberInput,
  CreateWalletExpenseInput,
  CreateWalletInput,
  ExpensesQueryInput
} from "../lib/validation.js";
import {
  type BillReminderRecord,
  BillReminderNotFoundError,
  BudgetNotFoundError,
  type BudgetRecord,
  ExpenseNotFoundError,
  IdempotencyConflictError,
  NotificationNotFoundError,
  type NotificationCheckResult,
  type NotificationRecord,
  type ReminderPreferencesRecord,
  type CreateExpenseResult,
  type ExpenseRecord,
  type ExpenseStore,
  WalletBudgetNotFoundError,
  WalletExpenseNotFoundError,
  WalletInviteNotFoundError,
  WalletNotFoundError,
  type WalletBalanceRecord,
  type WalletBudgetRecord,
  type WalletDetailRecord,
  type WalletExpenseRecord,
  type WalletExpenseSplitRecord,
  type WalletMemberRecord,
  type WalletRecord,
  WalletSettlementNotFoundError,
  type WalletSettlementRecord,
  WalletValidationError,
  type WalletHistoryPagination
} from "./types.js";

type StoredExpense = {
  id: string;
  userId: string;
  amountMinor: number;
  category: string;
  description: string;
  date: string;
  createdAt: string;
  platform: string | null;
};

type StoredIdempotency = {
  requestHash: string;
  expenseId: string;
};

type StoredBudget = {
  id: string;
  userId: string;
  amountMinor: number;
  scope: "monthly" | "category";
  category: string | null;
  month: string;
  createdAt: string;
};

type StoredWallet = {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  defaultSplitRule: "equal" | "fixed" | "percentage";
  currency: string;
  createdAt: string;
};

type StoredWalletBudget = {
  id: string;
  walletId: string;
  amountMinor: number;
  scope: "monthly" | "category";
  category: string | null;
  month: string;
  createdAt: string;
};

type StoredWalletMember = {
  id: string;
  walletId: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  role: "owner" | "member";
  inviteStatus: "linked" | "pending" | "declined";
  joinedAt: string;
  budgetAlertsEnabled?: boolean;
  budgetAlertThreshold?: number;
};

type StoredWalletExpense = {
  id: string;
  walletId: string;
  paidByMemberId: string;
  amountMinor: number;
  category: string;
  description: string;
  date: string;
  splitRule: "equal" | "fixed" | "percentage";
  createdAt: string;
  platform: string | null;
};

type StoredWalletExpenseSplit = {
  walletExpenseId: string;
  memberId: string;
  amountMinor: number;
  percentageBasisPoints: number | null;
};

type StoredWalletSettlement = {
  id: string;
  walletId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  date: string;
  note: string | null;
  createdAt: string;
};

type StoredNotification = {
  id: string;
  userId: string;
  type: "budget-threshold" | "budget-overspent" | "daily-log" | "bill-due" | "wallet-invite";
  title: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
  scheduledFor: string | null;
  metadata: Record<string, string> | null;
  dedupeKey: string;
};

type StoredReminderPreferences = {
  userId: string;
  dailyLoggingEnabled: boolean;
  dailyLoggingHour: number;
  budgetAlertsEnabled: boolean;
  budgetAlertThreshold: number;
  defaultCurrency: string;
  defaultTimezone: string;
  displayName: string | null;
  photoUrl: string | null;
  updatedAt: string;
};

type StoredBillReminder = {
  id: string;
  userId: string;
  title: string;
  amountMinor: number | null;
  category: string | null;
  dueDate: string;
  recurrence: "once" | "weekly" | "monthly" | "yearly";
  intervalCount: number;
  reminderDaysBefore: number;
  isActive: boolean;
  createdAt: string;
};

const DEFAULT_REMINDER_PREFERENCES = {
  dailyLoggingEnabled: true,
  dailyLoggingHour: 20,
  budgetAlertsEnabled: true,
  budgetAlertThreshold: 80,
  defaultCurrency: "INR",
  defaultTimezone: "UTC"
} as const;

function mapExpense(expense: StoredExpense): ExpenseRecord {
  return {
    id: expense.id,
    amount: formatMinorUnits(expense.amountMinor),
    category: expense.category,
    description: expense.description,
    date: expense.date,
    created_at: expense.createdAt,
    platform: expense.platform
  };
}

function mapBudget(budget: StoredBudget): BudgetRecord {
  return {
    id: budget.id,
    amount: formatMinorUnits(budget.amountMinor),
    scope: budget.scope,
    category: budget.category,
    month: budget.month,
    created_at: budget.createdAt
  };
}

function mapWalletBudget(budget: StoredWalletBudget): WalletBudgetRecord {
  return {
    id: budget.id,
    wallet_id: budget.walletId,
    amount: formatMinorUnits(budget.amountMinor),
    scope: budget.scope,
    category: budget.category,
    month: budget.month,
    created_at: budget.createdAt
  };
}

function mapWallet(wallet: StoredWallet): WalletRecord {
  return {
    id: wallet.id,
    name: wallet.name,
    description: wallet.description,
    default_split_rule: wallet.defaultSplitRule,
    currency: wallet.currency,
    created_at: wallet.createdAt
  };
}

function mapWalletMember(member: StoredWalletMember): WalletMemberRecord {
  return {
    id: member.id,
    wallet_id: member.walletId,
    user_id: member.userId,
    display_name: member.displayName,
    email: member.email,
    role: member.role,
    invite_status: member.inviteStatus,
    joined_at: member.joinedAt,
    budget_alerts_enabled: member.budgetAlertsEnabled,
    budget_alert_threshold: member.budgetAlertThreshold
  };
}

function mapBillReminder(billReminder: StoredBillReminder): BillReminderRecord {
  return {
    id: billReminder.id,
    user_id: billReminder.userId,
    title: billReminder.title,
    amount: billReminder.amountMinor === null ? null : formatMinorUnits(billReminder.amountMinor),
    category: billReminder.category,
    due_date: billReminder.dueDate,
    recurrence: billReminder.recurrence,
    interval_count: billReminder.intervalCount,
    reminder_days_before: billReminder.reminderDaysBefore,
    is_active: billReminder.isActive,
    created_at: billReminder.createdAt
  };
}

function mapNotification(notification: StoredNotification): NotificationRecord {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    status: notification.status,
    created_at: notification.createdAt,
    scheduled_for: notification.scheduledFor,
    metadata: notification.metadata
  };
}

function mapReminderPreferences(preferences: StoredReminderPreferences): ReminderPreferencesRecord {
  return {
    daily_logging_enabled: preferences.dailyLoggingEnabled,
    daily_logging_hour: preferences.dailyLoggingHour,
    budget_alerts_enabled: preferences.budgetAlertsEnabled,
    budget_alert_threshold: preferences.budgetAlertThreshold,
    default_currency: preferences.defaultCurrency,
    default_timezone: preferences.defaultTimezone,
    display_name: preferences.displayName,
    photo_url: preferences.photoUrl,
    updated_at: preferences.updatedAt
  };
}

function getTodayIsoDate(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

function getCurrentMonth(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

function getDateTimeInTimezone(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = Number(getPart("hour"));

    return {
      dateStr: `${year}-${month}-${day}`,
      monthStr: `${year}-${month}`,
      hour
    };
  } catch (e) {
    return {
      dateStr: date.toISOString().slice(0, 10),
      monthStr: date.toISOString().slice(0, 7),
      hour: date.getUTCHours()
    };
  }
}

function getUtcTimeForLocalHour(dateStr: string, hour: number, timeZone: string): string {
  try {
    const localIso = `${dateStr}T${String(hour).padStart(2, "0")}:00:00`;
    const tempUtc = new Date(`${localIso}Z`);
    const dateInTz = new Date(tempUtc.toLocaleString("en-US", { timeZone }));
    const diff = tempUtc.getTime() - dateInTz.getTime();
    const targetDate = new Date(tempUtc.getTime() + diff);
    return targetDate.toISOString();
  } catch (e) {
    return `${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  }
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addRecurrence(date: Date, recurrence: StoredBillReminder["recurrence"], intervalCount: number): Date {
  const nextDate = new Date(date);

  if (recurrence === "weekly") {
    nextDate.setDate(nextDate.getDate() + intervalCount * 7);
  } else if (recurrence === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + intervalCount);
  } else if (recurrence === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + intervalCount);
  }

  return nextDate;
}

function getUpcomingBillDueDate(billReminder: StoredBillReminder, now: Date): string | null {
  if (!billReminder.isActive) {
    return null;
  }

  let dueDate = new Date(`${billReminder.dueDate}T00:00:00.000Z`);
  const currentDate = new Date(`${getTodayIsoDate(now)}T00:00:00.000Z`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  if (billReminder.recurrence === "once") {
    return dueDate >= currentDate || addDays(dueDate, billReminder.reminderDaysBefore + 1) >= currentDate ? billReminder.dueDate : null;
  }

  while (addDays(dueDate, billReminder.reminderDaysBefore + 1) < currentDate) {
    dueDate = addRecurrence(dueDate, billReminder.recurrence, billReminder.intervalCount);
  }

  return getTodayIsoDate(dueDate);
}

function buildEqualSplits(totalAmount: number, memberIds: string[]): Array<{ memberId: string; amountMinor: number; percentageBasisPoints: number | null }> {
  const baseShare = Math.floor(totalAmount / memberIds.length);
  let remainder = totalAmount - baseShare * memberIds.length;

  return memberIds.map((memberId) => {
    const amountMinor = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }

    return {
      memberId,
      amountMinor,
      percentageBasisPoints: null
    };
  });
}

function buildPercentageSplits(totalAmount: number, splits: CreateWalletExpenseInput["splits"]): Array<{ memberId: string; amountMinor: number; percentageBasisPoints: number | null }> {
  const rawAllocations = splits.map((split) => {
    const basisPoints = split.value ?? 0;
    const multiplied = totalAmount * basisPoints;
    return {
      memberId: split.memberId,
      amountMinor: Math.floor(multiplied / 10000),
      remainder: multiplied % 10000,
      percentageBasisPoints: basisPoints
    };
  });

  let distributedAmount = rawAllocations.reduce((sum, split) => sum + split.amountMinor, 0);
  const remainingMinorUnits = totalAmount - distributedAmount;

  rawAllocations
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, remainingMinorUnits)
    .forEach((split) => {
      split.amountMinor += 1;
      distributedAmount += 1;
    });

  return rawAllocations.map((split) => ({
    memberId: split.memberId,
    amountMinor: split.amountMinor,
    percentageBasisPoints: split.percentageBasisPoints
  }));
}

export function createMemoryExpenseStore(): ExpenseStore {
  const expenses = new Map<string, StoredExpense>();
  const budgets = new Map<string, StoredBudget>();
  const idempotencyRequests = new Map<string, StoredIdempotency>();
  const wallets = new Map<string, StoredWallet>();
  const walletBudgets = new Map<string, StoredWalletBudget>();
  const walletMembers = new Map<string, StoredWalletMember>();
  const walletExpenses = new Map<string, StoredWalletExpense>();
  const walletExpenseSplits = new Map<string, StoredWalletExpenseSplit[]>();
  const walletSettlements = new Map<string, StoredWalletSettlement>();
  const notifications = new Map<string, StoredNotification>();
  const reminderPreferences = new Map<string, StoredReminderPreferences>();
  const billReminders = new Map<string, StoredBillReminder>();

  function listWalletMembers(walletId: string): StoredWalletMember[] {
    return [...walletMembers.values()]
      .filter((member) => member.walletId === walletId)
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
  }

  function assertWalletAccess(userId: string, walletId: string): StoredWallet {
    const wallet = wallets.get(walletId);

    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const hasAccess = listWalletMembers(walletId).some((member) => member.userId === userId);

    if (!hasAccess) {
      throw new WalletNotFoundError();
    }

    return wallet;
  }

  function buildWalletDetail(walletId: string, pagination?: WalletHistoryPagination): WalletDetailRecord {
    const wallet = wallets.get(walletId);

    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const pag = pagination ?? { expenseLimit: 50, expenseOffset: 0, settlementLimit: 50, settlementOffset: 0 };

    const members = listWalletMembers(walletId);
    const membersById = new Map(members.map((member) => [member.id, member]));
    const budgetRecords = [...walletBudgets.values()]
      .filter((budget) => budget.walletId === walletId)
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);
        return byMonth !== 0 ? byMonth : right.createdAt.localeCompare(left.createdAt);
      })
      .map(mapWalletBudget);

    const allExpenses = [...walletExpenses.values()]
      .filter((expense) => expense.walletId === walletId)
      .sort((left, right) => {
        const byDate = right.date.localeCompare(left.date);
        return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
      });

    const paginatedExpenses = allExpenses.slice(pag.expenseOffset, pag.expenseOffset + pag.expenseLimit);

    const expenseRecords: WalletExpenseRecord[] = paginatedExpenses.map((expense) => {
      const payer = membersById.get(expense.paidByMemberId);
      const splits = (walletExpenseSplits.get(expense.id) ?? []).map((split): WalletExpenseSplitRecord => ({
        member_id: split.memberId,
        member_name: membersById.get(split.memberId)?.displayName ?? "Unknown member",
        amount: formatMinorUnits(split.amountMinor),
        percentage: split.percentageBasisPoints === null ? null : split.percentageBasisPoints / 100
      }));

      return {
        id: expense.id,
        wallet_id: expense.walletId,
        paid_by_member_id: expense.paidByMemberId,
        paid_by_member_name: payer?.displayName ?? "Unknown member",
        amount: formatMinorUnits(expense.amountMinor),
        category: expense.category,
        description: expense.description,
        date: expense.date,
        split_rule: expense.splitRule,
        created_at: expense.createdAt,
        platform: expense.platform ?? null,
        splits
      };
    });

    const allSettlements = [...walletSettlements.values()]
      .filter((settlement) => settlement.walletId === walletId)
      .sort((left, right) => {
        const byDate = right.date.localeCompare(left.date);
        return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
      });

    const paginatedSettlements = allSettlements.slice(pag.settlementOffset, pag.settlementOffset + pag.settlementLimit);

    const settlements: WalletSettlementRecord[] = paginatedSettlements.map((settlement) => ({
      id: settlement.id,
      wallet_id: settlement.walletId,
      from_member_id: settlement.fromMemberId,
      from_member_name: membersById.get(settlement.fromMemberId)?.displayName ?? "Unknown member",
      to_member_id: settlement.toMemberId,
      to_member_name: membersById.get(settlement.toMemberId)?.displayName ?? "Unknown member",
      amount: formatMinorUnits(settlement.amountMinor),
      date: settlement.date,
      note: settlement.note,
      created_at: settlement.createdAt
    }));

    const balancesByMember = new Map(members.map((member) => [member.id, 0]));

    for (const expense of [...walletExpenses.values()].filter((item) => item.walletId === walletId)) {
      balancesByMember.set(expense.paidByMemberId, (balancesByMember.get(expense.paidByMemberId) ?? 0) + expense.amountMinor);

      for (const split of walletExpenseSplits.get(expense.id) ?? []) {
        balancesByMember.set(split.memberId, (balancesByMember.get(split.memberId) ?? 0) - split.amountMinor);
      }
    }

    for (const settlement of [...walletSettlements.values()].filter((item) => item.walletId === walletId)) {
      balancesByMember.set(settlement.fromMemberId, (balancesByMember.get(settlement.fromMemberId) ?? 0) + settlement.amountMinor);
      balancesByMember.set(settlement.toMemberId, (balancesByMember.get(settlement.toMemberId) ?? 0) - settlement.amountMinor);
    }

    const balances: WalletBalanceRecord[] = members
      .map((member) => ({
        member_id: member.id,
        member_name: member.displayName,
        net_amount: formatMinorUnits(balancesByMember.get(member.id) ?? 0)
      }))
      .sort((left, right) => Number(right.net_amount) - Number(left.net_amount));

    // Calculate aggregations on ALL expenses (uncut)
    const totalAmountMinor = allExpenses.reduce((sum, e) => sum + e.amountMinor, 0);
    const expenseCount = allExpenses.length;

    const monthlyMap = new Map<string, { totalMinor: number; count: number }>();
    for (const exp of allExpenses) {
      const month = exp.date.slice(0, 7); // YYYY-MM
      const curr = monthlyMap.get(month) ?? { totalMinor: 0, count: 0 };
      curr.totalMinor += exp.amountMinor;
      curr.count += 1;
      monthlyMap.set(month, curr);
    }
    const monthlyTotals = [...monthlyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        total: formatMinorUnits(data.totalMinor),
        count: data.count
      }));

    const categoryMap = new Map<string, { totalMinor: number; count: number; platforms: Set<string> }>();
    const categoryPlatformMap = new Map<string, Map<string, number>>();
    for (const exp of allExpenses) {
      const category = exp.category;
      const curr = categoryMap.get(category) ?? { totalMinor: 0, count: 0, platforms: new Set<string>() };
      curr.totalMinor += exp.amountMinor;
      curr.count += 1;
      curr.platforms.add(exp.platform || "others");
      categoryMap.set(category, curr);

      const catPlats = categoryPlatformMap.get(category) ?? new Map<string, number>();
      const plat = exp.platform || "others";
      catPlats.set(plat, (catPlats.get(plat) ?? 0) + exp.amountMinor);
      categoryPlatformMap.set(category, catPlats);
    }
    const categoryTotals = [...categoryMap.entries()]
      .sort((a, b) => b[1].totalMinor - a[1].totalMinor)
      .map(([category, data]) => {
        const sharesMap = categoryPlatformMap.get(category);
        const platform_shares = sharesMap
          ? [...sharesMap.entries()].map(([platform, amountMinor]) => ({
              platform,
              total: formatMinorUnits(amountMinor)
            }))
          : [];
        return {
          category,
          total: formatMinorUnits(data.totalMinor),
          count: data.count,
          platforms: Array.from(data.platforms),
          platform_shares
        };
      });

    // Group by month and category
    const budgetMap = new Map<string, number>(); // key: "month:category"
    for (const exp of allExpenses) {
      const month = exp.date.slice(0, 7);
      const key = `${month}:${exp.category}`;
      budgetMap.set(key, (budgetMap.get(key) ?? 0) + exp.amountMinor);
    }
    const budgetTotals = [...budgetMap.entries()].map(([key, amountMinor]) => {
      const [month, category] = key.split(":");
      return {
        month,
        category: category || null,
        total: formatMinorUnits(amountMinor)
      };
    });

    const walletAggregation = {
      total_amount: formatMinorUnits(totalAmountMinor),
      expense_count: expenseCount,
      monthly_totals: monthlyTotals,
      category_totals: categoryTotals,
      budget_totals: budgetTotals
    };

    return {
      wallet: mapWallet(wallet),
      members: members.map(mapWalletMember),
      budgets: budgetRecords,
      expenses: expenseRecords,
      balances,
      settlements,
      walletAggregation,
      expensePagination: {
        limit: pag.expenseLimit,
        offset: pag.expenseOffset,
        total: allExpenses.length,
        hasMore: pag.expenseOffset + expenseRecords.length < allExpenses.length
      },
      settlementPagination: {
        limit: pag.settlementLimit,
        offset: pag.settlementOffset,
        total: allSettlements.length,
        hasMore: pag.settlementOffset + settlements.length < allSettlements.length
      }
    };
  }

  function getReminderPreferencesInternal(userId: string): StoredReminderPreferences {
    const existing = reminderPreferences.get(userId);

    if (existing) {
      return existing;
    }

    const defaults: StoredReminderPreferences = {
      userId,
      dailyLoggingEnabled: DEFAULT_REMINDER_PREFERENCES.dailyLoggingEnabled,
      dailyLoggingHour: DEFAULT_REMINDER_PREFERENCES.dailyLoggingHour,
      budgetAlertsEnabled: DEFAULT_REMINDER_PREFERENCES.budgetAlertsEnabled,
      budgetAlertThreshold: DEFAULT_REMINDER_PREFERENCES.budgetAlertThreshold,
      defaultCurrency: DEFAULT_REMINDER_PREFERENCES.defaultCurrency,
      defaultTimezone: DEFAULT_REMINDER_PREFERENCES.defaultTimezone,
      displayName: null,
      photoUrl: null,
      updatedAt: new Date().toISOString()
    };

    reminderPreferences.set(userId, defaults);
    return defaults;
  }

  function createNotificationIfMissing(input: Omit<StoredNotification, "id" | "createdAt" | "status">): StoredNotification | null {
    const existing = [...notifications.values()].find((notification) => notification.userId === input.userId && notification.dedupeKey === input.dedupeKey);

    if (existing) {
      return null;
    }

    const nextNotification: StoredNotification = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      status: "unread",
      createdAt: new Date().toISOString(),
      scheduledFor: input.scheduledFor,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey
    };

    notifications.set(nextNotification.id, nextNotification);
    return nextNotification;
  }

  function markWalletInviteNotificationsRead(userId: string, walletMemberId: string) {
    for (const notification of notifications.values()) {
      if (notification.userId !== userId) {
        continue;
      }

      if (notification.type !== "wallet-invite" || notification.metadata?.walletMemberId !== walletMemberId) {
        continue;
      }

      notification.status = "read";
      notifications.set(notification.id, notification);
    }
  }

  function deleteWalletScopedNotifications(walletId: string, userId?: string) {
    for (const [notificationId, notification] of notifications.entries()) {
      if (userId && notification.userId !== userId) {
        continue;
      }

      if (notification.metadata?.walletId !== walletId) {
        continue;
      }

      notifications.delete(notificationId);
    }
  }

  function pruneExpiredBudgetNotifications(now = new Date(), userId?: string) {
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;

    for (const [notificationId, notification] of notifications.entries()) {
      if (userId && notification.userId !== userId) {
        continue;
      }

      if (notification.type !== "budget-threshold" && notification.type !== "budget-overspent") {
        continue;
      }

      const createdAt = Date.parse(notification.createdAt);

      if (Number.isNaN(createdAt) || createdAt >= cutoff) {
        continue;
      }

      notifications.delete(notificationId);
    }
  }

  function deleteWalletGraph(walletId: string) {
    wallets.delete(walletId);

    for (const [walletBudgetId, walletBudget] of walletBudgets.entries()) {
      if (walletBudget.walletId === walletId) {
        walletBudgets.delete(walletBudgetId);
      }
    }

    for (const [memberId, member] of walletMembers.entries()) {
      if (member.walletId === walletId) {
        walletMembers.delete(memberId);
      }
    }

    for (const [walletExpenseId, walletExpense] of walletExpenses.entries()) {
      if (walletExpense.walletId === walletId) {
        walletExpenses.delete(walletExpenseId);
        walletExpenseSplits.delete(walletExpenseId);
      }
    }

    for (const [settlementId, settlement] of walletSettlements.entries()) {
      if (settlement.walletId === walletId) {
        walletSettlements.delete(settlementId);
      }
    }

    deleteWalletScopedNotifications(walletId);
  }

  function memberHasWalletHistory(memberId: string): boolean {
    return [...walletExpenses.values()].some((expense) => expense.paidByMemberId === memberId)
      || [...walletExpenseSplits.values()].some((splits) => splits.some((split) => split.memberId === memberId))
      || [...walletSettlements.values()].some((settlement) => settlement.fromMemberId === memberId || settlement.toMemberId === memberId);
  }

  async function createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
    const scopedIdempotencyKey = `${userId}:${idempotencyKey}`;
    const requestHash = createExpenseRequestHash(input);
    const existingRequest = idempotencyRequests.get(scopedIdempotencyKey);

    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }

      const existingExpense = expenses.get(existingRequest.expenseId);

      if (!existingExpense) {
        throw new Error("Stored idempotency record is missing its expense.");
      }

      return {
        expense: mapExpense(existingExpense),
        created: false
      };
    }

    const nextExpense: StoredExpense = {
      id: randomUUID(),
      userId,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      createdAt: new Date().toISOString(),
      platform: input.platform ?? null
    };

    expenses.set(nextExpense.id, nextExpense);
    idempotencyRequests.set(scopedIdempotencyKey, {
      requestHash,
      expenseId: nextExpense.id
    });

    return {
      expense: mapExpense(nextExpense),
      created: true
    };
  }

  async function listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
    const filteredExpenses = [...expenses.values()]
      .filter((expense) => expense.userId === userId)
      .filter((expense) => !query.category || expense.category === query.category)
      .sort((left, right) => {
        if (query.sort === "date_desc") {
          const byDate = right.date.localeCompare(left.date);
          return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
        }

        return right.createdAt.localeCompare(left.createdAt);
      });

    return filteredExpenses.map(mapExpense);
  }

  async function updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
    const existingExpense = expenses.get(expenseId);

    if (!existingExpense || existingExpense.userId !== userId) {
      throw new ExpenseNotFoundError();
    }

    const updatedExpense: StoredExpense = {
      ...existingExpense,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      platform: input.platform ?? null
    };

    expenses.set(expenseId, updatedExpense);
    return mapExpense(updatedExpense);
  }

  async function deleteExpense(userId: string, expenseId: string): Promise<void> {
    const existingExpense = expenses.get(expenseId);

    if (!existingExpense || existingExpense.userId !== userId) {
      throw new ExpenseNotFoundError();
    }

    expenses.delete(expenseId);

    for (const [key, value] of idempotencyRequests.entries()) {
      if (value.expenseId === expenseId) {
        idempotencyRequests.delete(key);
      }
    }
  }

  async function createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    const nextBudget: StoredBudget = {
      id: randomUUID(),
      userId,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month,
      createdAt: new Date().toISOString()
    };

    budgets.set(nextBudget.id, nextBudget);
    return mapBudget(nextBudget);
  }

  async function listBudgets(userId: string): Promise<BudgetRecord[]> {
    return [...budgets.values()]
      .filter((budget) => budget.userId === userId)
      .sort((left, right) => {
        const byMonth = right.month.localeCompare(left.month);
        return byMonth !== 0 ? byMonth : right.createdAt.localeCompare(left.createdAt);
      })
      .map(mapBudget);
  }

  async function updateBudget(userId: string, budgetId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    const existingBudget = budgets.get(budgetId);

    if (!existingBudget || existingBudget.userId !== userId) {
      throw new BudgetNotFoundError();
    }

    const updatedBudget: StoredBudget = {
      ...existingBudget,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month
    };

    budgets.set(budgetId, updatedBudget);
    return mapBudget(updatedBudget);
  }

  async function deleteBudget(userId: string, budgetId: string): Promise<void> {
    const existingBudget = budgets.get(budgetId);

    if (!existingBudget || existingBudget.userId !== userId) {
      throw new BudgetNotFoundError();
    }

    budgets.delete(budgetId);
  }

  async function createWallet(userId: string, ownerProfile: { name: string | null; email: string | null }, input: CreateWalletInput): Promise<WalletDetailRecord> {
    const walletId = randomUUID();
    const createdAt = new Date().toISOString();
    const wallet: StoredWallet = {
      id: walletId,
      ownerUserId: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      defaultSplitRule: input.defaultSplitRule,
      currency: input.currency || "INR",
      createdAt
    };

    wallets.set(walletId, wallet);

    const ownerMember: StoredWalletMember = {
      id: randomUUID(),
      walletId,
      userId,
      displayName: ownerProfile.name?.trim() || ownerProfile.email?.trim() || "You",
      email: ownerProfile.email?.trim() || null,
      role: "owner",
      inviteStatus: "linked",
      joinedAt: createdAt
    };
    walletMembers.set(ownerMember.id, ownerMember);

    for (const member of input.members) {
      const normalizedName = member.displayName.trim();

      if (normalizedName.toLowerCase() === ownerMember.displayName.toLowerCase()) {
        continue;
      }

      const memberId = randomUUID();
      walletMembers.set(memberId, {
        id: memberId,
        walletId,
        userId: null,
        displayName: normalizedName,
        email: member.email?.trim() || null,
        role: "member",
        inviteStatus: member.email?.trim() ? "pending" : "linked",
        joinedAt: createdAt
      });
    }

    return buildWalletDetail(walletId);
  }

  async function updateWallet(userId: string, walletId: string, input: CreateWalletInput): Promise<WalletDetailRecord> {
    const wallet = wallets.get(walletId);

    if (!wallet) {
      throw new WalletNotFoundError();
    }

    assertWalletAccess(userId, walletId);

    if (wallet.ownerUserId !== userId) {
      throw new WalletValidationError("Only the wallet owner can edit this group.");
    }

    const oldCurrency = wallet.currency.toUpperCase();
    const newCurrency = (input.currency || "INR").toUpperCase();

    if (oldCurrency !== newCurrency) {
      const BASE_RATES_TO_USD: Record<string, number> = {
        USD: 1.0,
        EUR: 1.08,
        GBP: 1.27,
        INR: 0.012,
        JPY: 0.0064,
        CAD: 0.73,
        AUD: 0.66,
        CHF: 1.11,
        CNY: 0.14,
        SGD: 0.74,
        NZD: 0.61
      };

      const getExchangeRate = (from: string, to: string, dateStr: string): number => {
        const fromUpper = from.toUpperCase();
        const toUpper = to.toUpperCase();
        if (fromUpper === toUpper) return 1.0;

        const isDirect = fromUpper < toUpper;
        const first = isDirect ? fromUpper : toUpper;
        const second = isDirect ? toUpper : fromUpper;

        const firstRate = BASE_RATES_TO_USD[first] || 1.0;
        const secondRate = BASE_RATES_TO_USD[second] || 1.0;
        const baseRate = firstRate / secondRate;

        const clean = dateStr.replace(/[^0-9]/g, "");
        const num = parseInt(clean, 10);
        const dateHash = isNaN(num) ? 0 : num;
        const fluctuation = 1 + ((dateHash % 100) - 50) / 2500;
        const rate = baseRate * fluctuation;

        return isDirect ? rate : 1.0 / rate;
      };

      // 1. Convert budgets
      for (const bud of walletBudgets.values()) {
        if (bud.walletId === walletId) {
          const dateStr = `${bud.month}-01`;
          const rate = getExchangeRate(oldCurrency, newCurrency, dateStr);
          bud.amountMinor = Math.round(bud.amountMinor * rate);
        }
      }

      // 2. Convert expenses & splits
      for (const we of walletExpenses.values()) {
        if (we.walletId === walletId) {
          const rate = getExchangeRate(oldCurrency, newCurrency, we.date);
          we.amountMinor = Math.round(we.amountMinor * rate);

          const splits = walletExpenseSplits.get(we.id);
          if (splits) {
            for (const split of splits) {
              split.amountMinor = Math.round(split.amountMinor * rate);
            }
          }
        }
      }

      // 3. Convert settlements
      for (const setl of walletSettlements.values()) {
        if (setl.walletId === walletId) {
          const rate = getExchangeRate(oldCurrency, newCurrency, setl.date);
          setl.amountMinor = Math.round(setl.amountMinor * rate);
        }
      }
    }

    wallet.name = input.name.trim();
    wallet.description = input.description?.trim() || null;
    wallet.defaultSplitRule = input.defaultSplitRule;
    wallet.currency = input.currency || "INR";

    const currentMembers = [...walletMembers.values()].filter((m) => m.walletId === walletId);
    const ownerMember = currentMembers.find((m) => m.role === "owner");
    const keptMemberIds = new Set<string>();
    if (ownerMember) {
      keptMemberIds.add(ownerMember.id);
    }

    for (const member of input.members) {
      const normalizedName = member.displayName.trim();
      const normalizedEmail = member.email?.trim().toLowerCase() || null;

      if (ownerMember && (normalizedName.toLowerCase() === ownerMember.displayName.toLowerCase() || (normalizedEmail && ownerMember.email && normalizedEmail === ownerMember.email.toLowerCase()))) {
        continue;
      }

      let existingMember = null;
      if (normalizedEmail) {
        existingMember = currentMembers.find((m) => m.email && m.email.toLowerCase() === normalizedEmail);
      } else {
        existingMember = currentMembers.find((m) => m.displayName.toLowerCase() === normalizedName.toLowerCase());
      }

      if (existingMember) {
        existingMember.displayName = normalizedName;
        keptMemberIds.add(existingMember.id);
      } else {
        const newId = randomUUID();
        walletMembers.set(newId, {
          id: newId,
          walletId,
          userId: null,
          displayName: normalizedName,
          email: normalizedEmail,
          role: "member",
          inviteStatus: normalizedEmail ? "pending" : "linked",
          joinedAt: new Date().toISOString()
        });
        keptMemberIds.add(newId);
      }
    }

    for (const member of currentMembers) {
      if (keptMemberIds.has(member.id)) {
        continue;
      }

      if (memberHasWalletHistory(member.id)) {
        member.userId = null;
        member.email = null;
        member.inviteStatus = "declined";
      } else {
        walletMembers.delete(member.id);
      }
    }

    return buildWalletDetail(walletId);
  }

  async function createWalletBudget(userId: string, walletId: string, input: CreateBudgetInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const nextBudget: StoredWalletBudget = {
      id: randomUUID(),
      walletId,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month,
      createdAt: new Date().toISOString()
    };

    walletBudgets.set(nextBudget.id, nextBudget);
    return buildWalletDetail(walletId);
  }

  async function updateWalletBudget(userId: string, walletId: string, walletBudgetId: string, input: CreateBudgetInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingBudget = walletBudgets.get(walletBudgetId);

    if (!existingBudget || existingBudget.walletId !== walletId) {
      throw new WalletBudgetNotFoundError();
    }

    walletBudgets.set(walletBudgetId, {
      ...existingBudget,
      amountMinor: input.amount,
      scope: input.scope,
      category: input.scope === "category" ? input.category?.trim() ?? null : null,
      month: input.month
    });

    return buildWalletDetail(walletId);
  }

  async function deleteWalletBudget(userId: string, walletId: string, walletBudgetId: string): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingBudget = walletBudgets.get(walletBudgetId);

    if (!existingBudget || existingBudget.walletId !== walletId) {
      throw new WalletBudgetNotFoundError();
    }

    walletBudgets.delete(walletBudgetId);
    return buildWalletDetail(walletId);
  }

  async function createWalletMember(userId: string, walletId: string, input: CreateWalletMemberInput): Promise<WalletDetailRecord> {
    const wallet = assertWalletAccess(userId, walletId);

    if (wallet.ownerUserId !== userId) {
      throw new WalletValidationError("Only the wallet owner can invite members.");
    }

    const normalizedName = input.displayName.trim();
    const normalizedEmail = input.email?.trim().toLowerCase() || null;
    const existingMember = listWalletMembers(walletId).find((member) => (normalizedEmail ? member.email?.toLowerCase() === normalizedEmail : member.displayName.toLowerCase() === normalizedName.toLowerCase()));

    if (existingMember) {
      throw new WalletValidationError("That member is already part of this wallet.");
    }

    const memberId = randomUUID();
    walletMembers.set(memberId, {
      id: memberId,
      walletId,
      userId: null,
      displayName: normalizedName,
      email: normalizedEmail,
      role: "member",
      inviteStatus: normalizedEmail ? "pending" : "linked",
      joinedAt: new Date().toISOString()
    });

    return buildWalletDetail(walletId);
  }

  async function removeWalletMember(userId: string, walletId: string, memberId: string): Promise<WalletDetailRecord> {
    const wallet = assertWalletAccess(userId, walletId);

    if (wallet.ownerUserId !== userId) {
      throw new WalletValidationError("Only the wallet owner can remove members.");
    }

    const member = walletMembers.get(memberId);
    if (!member || member.walletId !== walletId) {
      throw new WalletNotFoundError();
    }

    if (member.role === "owner") {
      throw new WalletValidationError("Cannot remove the wallet owner.");
    }

    const hasExpenses = [...walletExpenses.values()].some((e) => e.walletId === walletId && e.paidByMemberId === memberId);
    const hasSplits = [...walletExpenseSplits.values()].some((splits) => splits.some((split) => split.memberId === memberId));
    const hasSettlements = [...walletSettlements.values()].some((s) => s.walletId === walletId && (s.fromMemberId === memberId || s.toMemberId === memberId));

    if (hasExpenses || hasSplits || hasSettlements) {
      member.userId = null;
      member.email = null;
      member.inviteStatus = "declined";
    } else {
      walletMembers.delete(memberId);
    }

    for (const [id, notification] of notifications.entries()) {
      if (notification.metadata?.walletMemberId === memberId) {
        notifications.delete(id);
      }
    }

    return buildWalletDetail(walletId);
  }

  async function linkWalletInvites(userId: string, profile: { email: string | null; name: string | null }): Promise<number> {
    const normalizedEmail = profile.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return 0;
    }

    let linkedCount = 0;

    for (const member of walletMembers.values()) {
      if (member.userId || member.inviteStatus !== "pending" || !member.email || member.email.toLowerCase() !== normalizedEmail) {
        continue;
      }

      const wallet = wallets.get(member.walletId);

      if (!wallet) {
        continue;
      }

      createNotificationIfMissing({
        userId,
        type: "wallet-invite",
        title: `You were added to ${wallet.name}`,
        message: `Review your invite to join ${wallet.name}.`,
        scheduledFor: null,
        metadata: {
          walletId: wallet.id,
          walletMemberId: member.id,
          walletName: wallet.name
        },
        dedupeKey: `wallet-invite:${member.id}`
      });

      linkedCount += 1;
    }

    return linkedCount;
  }

  async function respondToWalletInvite(userId: string, profile: { email: string | null; name: string | null }, walletMemberId: string, action: "accept" | "decline"): Promise<void> {
    const normalizedEmail = profile.email?.trim().toLowerCase();
    const member = walletMembers.get(walletMemberId);

    if (!member || !normalizedEmail || member.email?.toLowerCase() !== normalizedEmail || member.inviteStatus !== "pending") {
      throw new WalletInviteNotFoundError();
    }

    if (action === "accept") {
      member.userId = userId;
      member.inviteStatus = "linked";

      if (profile.name?.trim()) {
        member.displayName = profile.name.trim();
      }
    } else {
      member.inviteStatus = "declined";
    }

    walletMembers.set(walletMemberId, member);
    markWalletInviteNotificationsRead(userId, walletMemberId);
  }

  async function listWallets(userId: string): Promise<WalletRecord[]> {
    const accessibleWalletIds = new Set([...walletMembers.values()].filter((member) => member.userId === userId).map((member) => member.walletId));

    return [...wallets.values()]
      .filter((wallet) => accessibleWalletIds.has(wallet.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(mapWallet);
  }

  async function getWallet(userId: string, walletId: string, pagination?: WalletHistoryPagination): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);
    return buildWalletDetail(walletId, pagination);
  }

  async function deleteWallet(userId: string, walletId: string): Promise<void> {
    const wallet = assertWalletAccess(userId, walletId);

    if (wallet.ownerUserId !== userId) {
      throw new WalletValidationError("Only the wallet owner can delete this group.");
    }

    deleteWalletGraph(walletId);
  }

  async function leaveWallet(userId: string, walletId: string): Promise<void> {
    assertWalletAccess(userId, walletId);

    const membership = listWalletMembers(walletId).find((member) => member.userId === userId);

    if (!membership) {
      throw new WalletNotFoundError();
    }

    if (membership.role === "owner") {
      throw new WalletValidationError("The wallet owner can delete the group instead of exiting it.");
    }

    if (memberHasWalletHistory(membership.id)) {
      membership.userId = null;
      membership.email = null;
      membership.inviteStatus = "declined";
      walletMembers.set(membership.id, membership);
    } else {
      walletMembers.delete(membership.id);
    }

    deleteWalletScopedNotifications(walletId, userId);
  }

  async function createWalletExpense(userId: string, walletId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const members = listWalletMembers(walletId);
    const memberIds = new Set(members.map((member) => member.id));

    if (!memberIds.has(input.paidByMemberId)) {
      throw new WalletValidationError("The selected payer does not belong to this wallet.");
    }

    for (const split of input.splits) {
      if (!memberIds.has(split.memberId)) {
        throw new WalletValidationError("One or more split members do not belong to this wallet.");
      }
    }

    const walletExpenseId = randomUUID();
    const createdAt = new Date().toISOString();
    const nextWalletExpense: StoredWalletExpense = {
      id: walletExpenseId,
      walletId,
      paidByMemberId: input.paidByMemberId,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      splitRule: input.splitRule,
      createdAt,
      platform: input.platform ?? null
    };

    const normalizedSplits =
      input.splitRule === "equal"
        ? buildEqualSplits(input.amount, input.splits.map((split) => split.memberId))
        : input.splitRule === "fixed"
          ? input.splits.map((split) => ({
              memberId: split.memberId,
              amountMinor: split.value ?? 0,
              percentageBasisPoints: null
            }))
          : buildPercentageSplits(input.amount, input.splits);

    walletExpenses.set(walletExpenseId, nextWalletExpense);
    walletExpenseSplits.set(walletExpenseId, normalizedSplits.map((split) => ({
      walletExpenseId,
      memberId: split.memberId,
      amountMinor: split.amountMinor,
      percentageBasisPoints: split.percentageBasisPoints
    })));

    return buildWalletDetail(walletId);
  }

  async function updateWalletExpense(userId: string, walletId: string, walletExpenseId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingExpense = walletExpenses.get(walletExpenseId);
    if (!existingExpense || existingExpense.walletId !== walletId) {
      throw new WalletExpenseNotFoundError();
    }

    const members = listWalletMembers(walletId);
    const memberIds = new Set(members.map((member) => member.id));
    if (!memberIds.has(input.paidByMemberId) || input.splits.some((split) => !memberIds.has(split.memberId))) {
      throw new WalletValidationError("One or more wallet members are invalid for this shared expense.");
    }

    walletExpenses.set(walletExpenseId, {
      ...existingExpense,
      paidByMemberId: input.paidByMemberId,
      amountMinor: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      date: input.date,
      splitRule: input.splitRule,
      platform: input.platform ?? null
    });

    const normalizedSplits =
      input.splitRule === "equal"
        ? buildEqualSplits(input.amount, input.splits.map((split) => split.memberId))
        : input.splitRule === "fixed"
          ? input.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null }))
          : buildPercentageSplits(input.amount, input.splits);

    walletExpenseSplits.set(walletExpenseId, normalizedSplits.map((split) => ({
      walletExpenseId,
      memberId: split.memberId,
      amountMinor: split.amountMinor,
      percentageBasisPoints: split.percentageBasisPoints
    })));

    return buildWalletDetail(walletId);
  }

  async function deleteWalletExpense(userId: string, walletId: string, walletExpenseId: string): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingExpense = walletExpenses.get(walletExpenseId);
    if (!existingExpense || existingExpense.walletId !== walletId) {
      throw new WalletExpenseNotFoundError();
    }

    walletExpenses.delete(walletExpenseId);
    walletExpenseSplits.delete(walletExpenseId);
    return buildWalletDetail(walletId);
  }

  async function createWalletSettlement(userId: string, walletId: string, input: CreateSettlementInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const members = listWalletMembers(walletId);
    const memberIds = new Set(members.map((member) => member.id));

    if (!memberIds.has(input.fromMemberId) || !memberIds.has(input.toMemberId)) {
      throw new WalletValidationError("Settlement members must belong to this wallet.");
    }

    const settlement: StoredWalletSettlement = {
      id: randomUUID(),
      walletId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountMinor: input.amount,
      date: input.date,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString()
    };

    walletSettlements.set(settlement.id, settlement);
    return buildWalletDetail(walletId);
  }

  async function updateWalletSettlement(userId: string, walletId: string, settlementId: string, input: CreateSettlementInput): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingSettlement = walletSettlements.get(settlementId);
    if (!existingSettlement || existingSettlement.walletId !== walletId) {
      throw new WalletSettlementNotFoundError();
    }

    const members = listWalletMembers(walletId);
    const memberIds = new Set(members.map((member) => member.id));
    if (!memberIds.has(input.fromMemberId) || !memberIds.has(input.toMemberId)) {
      throw new WalletValidationError("Settlement members must belong to this wallet.");
    }

    walletSettlements.set(settlementId, {
      ...existingSettlement,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountMinor: input.amount,
      date: input.date,
      note: input.note?.trim() || null
    });

    return buildWalletDetail(walletId);
  }

  async function deleteWalletSettlement(userId: string, walletId: string, settlementId: string): Promise<WalletDetailRecord> {
    assertWalletAccess(userId, walletId);

    const existingSettlement = walletSettlements.get(settlementId);
    if (!existingSettlement || existingSettlement.walletId !== walletId) {
      throw new WalletSettlementNotFoundError();
    }

    walletSettlements.delete(settlementId);
    return buildWalletDetail(walletId);
  }

  async function listBillReminders(userId: string): Promise<BillReminderRecord[]> {
    return [...billReminders.values()]
      .filter((billReminder) => billReminder.userId === userId)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .map(mapBillReminder);
  }

  async function createBillReminder(userId: string, input: CreateBillReminderInput): Promise<BillReminderRecord> {
    const billReminder: StoredBillReminder = {
      id: randomUUID(),
      userId,
      title: input.title.trim(),
      amountMinor: input.amount,
      category: input.category?.trim() || null,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
      intervalCount: input.intervalCount,
      reminderDaysBefore: input.reminderDaysBefore,
      isActive: input.isActive,
      createdAt: new Date().toISOString()
    };

    billReminders.set(billReminder.id, billReminder);
    return mapBillReminder(billReminder);
  }

  async function updateBillReminder(userId: string, billReminderId: string, input: CreateBillReminderInput): Promise<BillReminderRecord> {
    const existingBillReminder = billReminders.get(billReminderId);
    if (!existingBillReminder || existingBillReminder.userId !== userId) {
      throw new BillReminderNotFoundError();
    }

    const nextBillReminder: StoredBillReminder = {
      ...existingBillReminder,
      title: input.title.trim(),
      amountMinor: input.amount,
      category: input.category?.trim() || null,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
      intervalCount: input.intervalCount,
      reminderDaysBefore: input.reminderDaysBefore,
      isActive: input.isActive
    };

    billReminders.set(billReminderId, nextBillReminder);
    return mapBillReminder(nextBillReminder);
  }

  async function deleteBillReminder(userId: string, billReminderId: string): Promise<void> {
    const existingBillReminder = billReminders.get(billReminderId);
    if (!existingBillReminder || existingBillReminder.userId !== userId) {
      throw new BillReminderNotFoundError();
    }

    billReminders.delete(billReminderId);
  }

  async function listNotifications(userId: string): Promise<NotificationRecord[]> {
    pruneExpiredBudgetNotifications(new Date(), userId);

    return [...notifications.values()]
      .filter((notification) => notification.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(mapNotification);
  }

  async function markNotificationRead(userId: string, notificationId: string): Promise<NotificationRecord> {
    const notification = notifications.get(notificationId);

    if (!notification || notification.userId !== userId) {
      throw new NotificationNotFoundError();
    }

    notification.status = "read";
    notifications.set(notificationId, notification);
    return mapNotification(notification);
  }

  async function markAllNotificationsRead(userId: string): Promise<void> {
    for (const notification of notifications.values()) {
      if (notification.userId === userId) {
        notification.status = "read";
      }
    }
  }

  async function deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = notifications.get(notificationId);

    if (!notification || notification.userId !== userId) {
      throw new NotificationNotFoundError();
    }

    notifications.delete(notificationId);
  }

  async function getReminderPreferences(userId: string): Promise<ReminderPreferencesRecord> {
    return mapReminderPreferences(getReminderPreferencesInternal(userId));
  }

  async function upsertReminderPreferences(userId: string, input: CreateReminderPreferencesInput): Promise<ReminderPreferencesRecord> {
    if (input.displayName) {
      const conflict = [...reminderPreferences.values()].some(
        (p) => p.userId !== userId && p.displayName?.toLowerCase() === input.displayName?.toLowerCase()
      );
      if (conflict) {
        throw new WalletValidationError("Username is already taken by another user.");
      }
    }

    const existing = reminderPreferences.get(userId);
    const displayName = input.displayName !== undefined ? input.displayName : (existing?.displayName ?? null);
    const photoUrl = input.photoUrl !== undefined ? input.photoUrl : (existing?.photoUrl ?? null);

    const defaultCurrency = input.defaultCurrency ?? DEFAULT_REMINDER_PREFERENCES.defaultCurrency;
    const defaultTimezone = input.defaultTimezone ?? DEFAULT_REMINDER_PREFERENCES.defaultTimezone;

    // Convert in-memory records to the new currency preference
    if (existing && existing.defaultCurrency && existing.defaultCurrency.toUpperCase() !== defaultCurrency.toUpperCase()) {
      const oldCurrency = existing.defaultCurrency.toUpperCase();
      const newCurrency = defaultCurrency.toUpperCase();

      const BASE_RATES_TO_USD: Record<string, number> = {
        USD: 1.0,
        EUR: 1.08,
        GBP: 1.27,
        INR: 0.012,
        JPY: 0.0064,
        CAD: 0.73,
        AUD: 0.66,
        CHF: 1.11,
        CNY: 0.14,
        SGD: 0.74,
        NZD: 0.61
      };

      const getExchangeRate = (from: string, to: string, dateStr: string): number => {
        const fromUpper = from.toUpperCase();
        const toUpper = to.toUpperCase();
        if (fromUpper === toUpper) return 1.0;

        const isDirect = fromUpper < toUpper;
        const first = isDirect ? fromUpper : toUpper;
        const second = isDirect ? toUpper : fromUpper;

        const firstRate = BASE_RATES_TO_USD[first] || 1.0;
        const secondRate = BASE_RATES_TO_USD[second] || 1.0;
        const baseRate = firstRate / secondRate;

        const clean = dateStr.replace(/[^0-9]/g, "");
        const num = parseInt(clean, 10);
        const dateHash = isNaN(num) ? 0 : num;
        const fluctuation = 1 + ((dateHash % 100) - 50) / 2500;
        const rate = baseRate * fluctuation;

        return isDirect ? rate : 1.0 / rate;
      };

      // 1. Personal Expenses
      for (const [id, exp] of expenses.entries()) {
        if (exp.userId === userId) {
          const rate = getExchangeRate(oldCurrency, newCurrency, exp.date);
          exp.amountMinor = Math.round(exp.amountMinor * rate);
          expenses.set(id, exp);
        }
      }

      // 2. Personal Budgets
      for (const [id, bud] of budgets.entries()) {
        if (bud.userId === userId) {
          const rate = getExchangeRate(oldCurrency, newCurrency, `${bud.month}-01`);
          bud.amountMinor = Math.round(bud.amountMinor * rate);
          budgets.set(id, bud);
        }
      }

      // 3. Personal Bill Reminders
      for (const [id, bill] of billReminders.entries()) {
        if (bill.userId === userId) {
          if (bill.amountMinor === null || bill.amountMinor === undefined) continue;
          const rate = getExchangeRate(oldCurrency, newCurrency, bill.dueDate);
          bill.amountMinor = Math.round(bill.amountMinor * rate);
          billReminders.set(id, bill);
        }
      }

      // 4. Wallet details (Budgets, Expenses, Settlements, Splits) where user is member
      const walletIds = [...walletMembers.values()]
        .filter((m) => m.userId === userId)
        .map((m) => m.walletId);

      if (walletIds.length > 0) {
        // Wallet Budgets
        for (const [id, wb] of walletBudgets.entries()) {
          if (walletIds.includes(wb.walletId)) {
            const rate = getExchangeRate(oldCurrency, newCurrency, `${wb.month}-01`);
            wb.amountMinor = Math.round(wb.amountMinor * rate);
            walletBudgets.set(id, wb);
          }
        }

        // Wallet Expenses & Splits
        for (const [id, we] of walletExpenses.entries()) {
          if (walletIds.includes(we.walletId)) {
            const rate = getExchangeRate(oldCurrency, newCurrency, we.date);
            we.amountMinor = Math.round(we.amountMinor * rate);
            walletExpenses.set(id, we);

            const splits = walletExpenseSplits.get(we.id);
            if (splits) {
              const updatedSplits = splits.map((split) => {
                return {
                  ...split,
                  amountMinor: Math.round(split.amountMinor * rate)
                };
              });
              walletExpenseSplits.set(we.id, updatedSplits);
            }
          }
        }

        // Wallet Settlements
        for (const [id, setl] of walletSettlements.entries()) {
          if (walletIds.includes(setl.walletId)) {
            const rate = getExchangeRate(oldCurrency, newCurrency, setl.date);
            setl.amountMinor = Math.round(setl.amountMinor * rate);
            walletSettlements.set(id, setl);
          }
        }
      }
    }

    const nextPreferences: StoredReminderPreferences = {
      userId,
      dailyLoggingEnabled: input.dailyLoggingEnabled,
      dailyLoggingHour: input.dailyLoggingHour,
      budgetAlertsEnabled: input.budgetAlertsEnabled,
      budgetAlertThreshold: input.budgetAlertThreshold,
      defaultCurrency: input.defaultCurrency ?? DEFAULT_REMINDER_PREFERENCES.defaultCurrency,
      defaultTimezone: input.defaultTimezone ?? DEFAULT_REMINDER_PREFERENCES.defaultTimezone,
      displayName,
      photoUrl,
      updatedAt: new Date().toISOString()
    };

    reminderPreferences.set(userId, nextPreferences);
    return mapReminderPreferences(nextPreferences);
  }

  async function getWalletReminderPreferences(userId: string, walletId: string): Promise<{ budget_alerts_enabled: boolean; budget_alert_threshold: number }> {
    const membership = [...walletMembers.values()].find(
      (m) => m.walletId === walletId && m.userId === userId && m.inviteStatus === "linked"
    );
    if (!membership) {
      throw new WalletValidationError("Not a member of this wallet or wallet does not exist.");
    }
    return {
      budget_alerts_enabled: membership.budgetAlertsEnabled !== undefined ? membership.budgetAlertsEnabled : true,
      budget_alert_threshold: membership.budgetAlertThreshold !== undefined ? membership.budgetAlertThreshold : 80
    };
  }

  async function upsertWalletReminderPreferences(
    userId: string,
    walletId: string,
    input: { budgetAlertsEnabled: boolean; budgetAlertThreshold: number }
  ): Promise<{ budget_alerts_enabled: boolean; budget_alert_threshold: number }> {
    const membership = [...walletMembers.values()].find(
      (m) => m.walletId === walletId && m.userId === userId && m.inviteStatus === "linked"
    );
    if (!membership) {
      throw new WalletValidationError("Not a member of this wallet or wallet does not exist.");
    }
    membership.budgetAlertsEnabled = input.budgetAlertsEnabled;
    membership.budgetAlertThreshold = input.budgetAlertThreshold;
    return {
      budget_alerts_enabled: membership.budgetAlertsEnabled,
      budget_alert_threshold: membership.budgetAlertThreshold
    };
  }

  async function runNotificationChecks(userId?: string, now = new Date()): Promise<NotificationCheckResult> {
    pruneExpiredBudgetNotifications(now, userId);

    const targetUserIds = userId
      ? [userId]
      : [...new Set([...[...expenses.values()].map((expense) => expense.userId), ...[...budgets.values()].map((budget) => budget.userId), ...reminderPreferences.keys()])];

    const createdNotifications: NotificationRecord[] = [];

    for (const targetUserId of targetUserIds) {
      const preferences = getReminderPreferencesInternal(targetUserId);

      const timezone = preferences.defaultTimezone || "UTC";
      const userTime = getDateTimeInTimezone(now, timezone);
      const userDate = userTime.dateStr;
      const userMonth = userTime.monthStr;
      const userHour = userTime.hour;

      if (preferences.dailyLoggingEnabled && userHour >= preferences.dailyLoggingHour) {
        const hasLoggedToday = [...expenses.values()].some((expense) => expense.userId === targetUserId && expense.date === userDate);

        if (!hasLoggedToday) {
          const scheduledForUtc = getUtcTimeForLocalHour(userDate, preferences.dailyLoggingHour, timezone);
          const created = createNotificationIfMissing({
            userId: targetUserId,
            type: "daily-log",
            title: "Log today's spending",
            message: "You have not added any expenses today. Capture them before the day ends.",
            scheduledFor: scheduledForUtc,
            metadata: { date: userDate },
            dedupeKey: `daily-log:${userDate}`
          });

          if (created) {
            createdNotifications.push(mapNotification(created));
          }
        }
      }

      if (!preferences.budgetAlertsEnabled) {
      } else {
        const userBudgets = [...budgets.values()].filter((budget) => budget.userId === targetUserId && budget.month === userMonth);
        const userExpenses = [...expenses.values()].filter((expense) => expense.userId === targetUserId && expense.date.startsWith(userMonth));

        for (const budget of userBudgets) {
          const spentMinor = userExpenses
            .filter((expense) => (budget.scope === "category" ? expense.category === budget.category : true))
            .reduce((sum, expense) => sum + expense.amountMinor, 0);

          if (spentMinor <= 0) {
            continue;
          }

          if (spentMinor > budget.amountMinor) {
            const created = createNotificationIfMissing({
              userId: targetUserId,
              type: "budget-overspent",
              title: budget.scope === "category" ? `${budget.category} budget exceeded` : "Monthly budget exceeded",
              message: `${formatMinorUnits(spentMinor)} spent against a ${formatMinorUnits(budget.amountMinor)} budget for ${budget.month}.`,
              scheduledFor: null,
              metadata: { budgetId: budget.id, month: budget.month },
              dedupeKey: `budget-overspent:${budget.id}:${budget.month}`
            });

            if (created) {
              createdNotifications.push(mapNotification(created));
            }

            continue;
          }

          const thresholdMinor = Math.ceil((budget.amountMinor * preferences.budgetAlertThreshold) / 100);

          if (spentMinor >= thresholdMinor) {
            const created = createNotificationIfMissing({
              userId: targetUserId,
              type: "budget-threshold",
              title: budget.scope === "category" ? `${budget.category} budget nearing limit` : "Monthly budget nearing limit",
              message: `${formatMinorUnits(spentMinor)} spent, which is ${preferences.budgetAlertThreshold}% or more of your ${formatMinorUnits(budget.amountMinor)} budget for ${budget.month}.`,
              scheduledFor: null,
              metadata: { budgetId: budget.id, month: budget.month },
              dedupeKey: `budget-threshold:${budget.id}:${budget.month}:${preferences.budgetAlertThreshold}`
            });

            if (created) {
              createdNotifications.push(mapNotification(created));
            }
          }
        }

        // Wallet budget checks
        const userWalletMemberships = [...walletMembers.values()].filter(
          (m) => m.userId === targetUserId && m.inviteStatus === "linked"
        );

        for (const membership of userWalletMemberships) {
          const wallet = wallets.get(membership.walletId);
          if (!wallet) continue;

          const walletBudgetAlertsEnabled = membership.budgetAlertsEnabled !== undefined ? membership.budgetAlertsEnabled : true;
          if (!walletBudgetAlertsEnabled) continue;

          const walletAlertThreshold = membership.budgetAlertThreshold !== undefined ? membership.budgetAlertThreshold : 80;

          const activeWalletBudgets = [...walletBudgets.values()].filter(
            (wb) => wb.walletId === wallet.id && wb.month === userMonth
          );

          for (const walletBudget of activeWalletBudgets) {
            const activeWalletExpenses = [...walletExpenses.values()].filter(
              (we) => we.walletId === wallet.id && we.date.startsWith(userMonth)
            );

            const spentMinor = activeWalletExpenses
              .filter((we) => (walletBudget.scope === "category" ? we.category === walletBudget.category : true))
              .reduce((sum, we) => sum + we.amountMinor, 0);

            if (spentMinor <= 0) {
              continue;
            }

            if (spentMinor > walletBudget.amountMinor) {
              const created = createNotificationIfMissing({
                userId: targetUserId,
                type: "budget-overspent",
                title: walletBudget.scope === "category" ? `[${wallet.name}] ${walletBudget.category} budget exceeded` : `[${wallet.name}] Budget exceeded`,
                message: `${formatMinorUnits(spentMinor)} spent against a ${formatMinorUnits(walletBudget.amountMinor)} budget for ${walletBudget.month}.`,
                scheduledFor: null,
                metadata: { walletId: wallet.id, budgetId: walletBudget.id, month: walletBudget.month },
                dedupeKey: `wallet-budget-overspent:${wallet.id}:${walletBudget.id}:${walletBudget.month}`
              });

              if (created) {
                createdNotifications.push(mapNotification(created));
              }

              continue;
            }

            const thresholdMinor = Math.ceil((walletBudget.amountMinor * walletAlertThreshold) / 100);

            if (spentMinor >= thresholdMinor) {
              const created = createNotificationIfMissing({
                userId: targetUserId,
                type: "budget-threshold",
                title: walletBudget.scope === "category" ? `[${wallet.name}] ${walletBudget.category} budget nearing limit` : `[${wallet.name}] Budget nearing limit`,
                message: `${formatMinorUnits(spentMinor)} spent, which is ${walletAlertThreshold}% or more of your ${formatMinorUnits(walletBudget.amountMinor)} budget for ${walletBudget.month}.`,
                scheduledFor: null,
                metadata: { walletId: wallet.id, budgetId: walletBudget.id, month: walletBudget.month },
                dedupeKey: `wallet-budget-threshold:${wallet.id}:${walletBudget.id}:${walletBudget.month}:${walletAlertThreshold}`
              });

              if (created) {
                createdNotifications.push(mapNotification(created));
              }
            }
          }
        }
      }

      for (const billReminder of [...billReminders.values()].filter((entry) => entry.userId === targetUserId)) {
        const nextDueDate = getUpcomingBillDueDate(billReminder, now);

        if (!nextDueDate) {
          continue;
        }

        const dueDate = new Date(`${nextDueDate}T00:00:00.000Z`);
        const reminderDate = addDays(dueDate, -billReminder.reminderDaysBefore);

        if (new Date(`${userDate}T00:00:00.000Z`) < reminderDate) {
          continue;
        }

        const created = createNotificationIfMissing({
          userId: targetUserId,
          type: "bill-due",
          title: `${billReminder.title} is coming up`,
          message: `${billReminder.title}${billReminder.amountMinor === null ? "" : ` for ${formatMinorUnits(billReminder.amountMinor)}`} is due on ${nextDueDate}.`,
          scheduledFor: reminderDate.toISOString(),
          metadata: { billReminderId: billReminder.id, dueDate: nextDueDate },
          dedupeKey: `bill-due:${billReminder.id}:${nextDueDate}`
        });

        if (created) {
          createdNotifications.push(mapNotification(created));
        }
      }
    }

    return {
      processed_user_count: targetUserIds.length,
      created_notifications: createdNotifications
    };
  }

  async function deleteUserData(userId: string): Promise<void> {
    for (const [expenseId, expense] of expenses.entries()) {
      if (expense.userId === userId) {
        expenses.delete(expenseId);
      }
    }

    for (const [budgetId, budget] of budgets.entries()) {
      if (budget.userId === userId) {
        budgets.delete(budgetId);
      }
    }

    for (const [key] of idempotencyRequests.entries()) {
      if (key.startsWith(`${userId}:`)) {
        idempotencyRequests.delete(key);
      }
    }

    const ownedWalletIds = [...wallets.values()].filter((wallet) => wallet.ownerUserId === userId).map((wallet) => wallet.id);

    for (const walletId of ownedWalletIds) {
      deleteWalletGraph(walletId);
    }

    for (const [notificationId, notification] of notifications.entries()) {
      if (notification.userId === userId) {
        notifications.delete(notificationId);
      }
    }

    reminderPreferences.delete(userId);

    for (const [billReminderId, billReminder] of billReminders.entries()) {
      if (billReminder.userId === userId) {
        billReminders.delete(billReminderId);
      }
    }
  }

  return {
    createExpense,
    listExpenses,
    updateExpense,
    deleteExpense,
    createBudget,
    listBudgets,
    updateBudget,
    deleteBudget,
    createWallet,
    updateWallet,
    listWallets,
    getWallet,
    deleteWallet,
    leaveWallet,
    createWalletBudget,
    updateWalletBudget,
    deleteWalletBudget,
    createWalletMember,
    removeWalletMember,
    linkWalletInvites,
    respondToWalletInvite,
    createWalletExpense,
    updateWalletExpense,
    deleteWalletExpense,
    createWalletSettlement,
    updateWalletSettlement,
    deleteWalletSettlement,
    listBillReminders,
    createBillReminder,
    updateBillReminder,
    deleteBillReminder,
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    getReminderPreferences,
    upsertReminderPreferences,
    getWalletReminderPreferences,
    upsertWalletReminderPreferences,
    runNotificationChecks,
    deleteUserData
  };
}