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

export type ExpenseRecord = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  created_at: string;
};

export type BudgetScope = "monthly" | "category";

export type BudgetRecord = {
  id: string;
  amount: string;
  scope: BudgetScope;
  category: string | null;
  month: string;
  created_at: string;
};

export type WalletBudgetRecord = BudgetRecord & {
  wallet_id: string;
};

export type SplitRule = "equal" | "fixed" | "percentage";

export type WalletMemberRole = "owner" | "member";

export type WalletRecord = {
  id: string;
  name: string;
  description: string | null;
  default_split_rule: SplitRule;
  created_at: string;
};

export type WalletMemberRecord = {
  id: string;
  wallet_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  role: WalletMemberRole;
  invite_status: "linked" | "pending" | "declined";
  joined_at: string;
};

export type WalletExpenseSplitRecord = {
  member_id: string;
  member_name: string;
  amount: string;
  percentage: number | null;
};

export type WalletExpenseRecord = {
  id: string;
  wallet_id: string;
  paid_by_member_id: string;
  paid_by_member_name: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  split_rule: SplitRule;
  created_at: string;
  splits: WalletExpenseSplitRecord[];
};

export type WalletBalanceRecord = {
  member_id: string;
  member_name: string;
  net_amount: string;
};

export type WalletSettlementRecord = {
  id: string;
  wallet_id: string;
  from_member_id: string;
  from_member_name: string;
  to_member_id: string;
  to_member_name: string;
  amount: string;
  date: string;
  note: string | null;
  created_at: string;
};

export type WalletDetailRecord = {
  wallet: WalletRecord;
  members: WalletMemberRecord[];
  budgets: WalletBudgetRecord[];
  expenses: WalletExpenseRecord[];
  balances: WalletBalanceRecord[];
  settlements: WalletSettlementRecord[];
};

export type BillReminderRecurrence = "once" | "weekly" | "monthly" | "yearly";

export type BillReminderRecord = {
  id: string;
  user_id: string;
  title: string;
  amount: string | null;
  category: string | null;
  due_date: string;
  recurrence: BillReminderRecurrence;
  interval_count: number;
  reminder_days_before: number;
  is_active: boolean;
  created_at: string;
};

export type NotificationType = "budget-threshold" | "budget-overspent" | "daily-log" | "bill-due" | "wallet-invite" | "invite-response";

export type NotificationStatus = "unread" | "read";

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  created_at: string;
  scheduled_for: string | null;
  metadata: Record<string, string> | null;
};

export type ReminderPreferencesRecord = {
  daily_logging_enabled: boolean;
  daily_logging_hour: number;
  budget_alerts_enabled: boolean;
  budget_alert_threshold: number;
  updated_at: string;
};

export type NotificationCheckResult = {
  processed_user_count: number;
  created_notifications: NotificationRecord[];
};

export type CreateExpenseResult = {
  expense: ExpenseRecord;
  created: boolean;
};

export interface ExpenseStore {
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult>;
  listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]>;
  updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord>;
  deleteExpense(userId: string, expenseId: string): Promise<void>;
  createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRecord>;
  listBudgets(userId: string): Promise<BudgetRecord[]>;
  updateBudget(userId: string, budgetId: string, input: CreateBudgetInput): Promise<BudgetRecord>;
  deleteBudget(userId: string, budgetId: string): Promise<void>;
  createWallet(userId: string, ownerProfile: { name: string | null; email: string | null }, input: CreateWalletInput): Promise<WalletDetailRecord>;
  listWallets(userId: string): Promise<WalletRecord[]>;
  getWallet(userId: string, walletId: string): Promise<WalletDetailRecord>;
  deleteWallet(userId: string, walletId: string): Promise<void>;
  leaveWallet(userId: string, walletId: string): Promise<void>;
  createWalletBudget(userId: string, walletId: string, input: CreateBudgetInput): Promise<WalletDetailRecord>;
  updateWalletBudget(userId: string, walletId: string, walletBudgetId: string, input: CreateBudgetInput): Promise<WalletDetailRecord>;
  deleteWalletBudget(userId: string, walletId: string, walletBudgetId: string): Promise<WalletDetailRecord>;
  createWalletMember(userId: string, walletId: string, input: CreateWalletMemberInput): Promise<WalletDetailRecord>;
  removeWalletMember(userId: string, walletId: string, memberId: string): Promise<WalletDetailRecord>;
  linkWalletInvites(userId: string, profile: { email: string | null; name: string | null }): Promise<number>;
  respondToWalletInvite(userId: string, profile: { email: string | null; name: string | null }, walletMemberId: string, action: "accept" | "decline"): Promise<void>;
  createWalletExpense(userId: string, walletId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord>;
  updateWalletExpense(userId: string, walletId: string, walletExpenseId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord>;
  deleteWalletExpense(userId: string, walletId: string, walletExpenseId: string): Promise<WalletDetailRecord>;
  createWalletSettlement(userId: string, walletId: string, input: CreateSettlementInput): Promise<WalletDetailRecord>;
  updateWalletSettlement(userId: string, walletId: string, settlementId: string, input: CreateSettlementInput): Promise<WalletDetailRecord>;
  deleteWalletSettlement(userId: string, walletId: string, settlementId: string): Promise<WalletDetailRecord>;
  listBillReminders(userId: string): Promise<BillReminderRecord[]>;
  createBillReminder(userId: string, input: CreateBillReminderInput): Promise<BillReminderRecord>;
  updateBillReminder(userId: string, billReminderId: string, input: CreateBillReminderInput): Promise<BillReminderRecord>;
  deleteBillReminder(userId: string, billReminderId: string): Promise<void>;
  listNotifications(userId: string): Promise<NotificationRecord[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<NotificationRecord>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(userId: string, notificationId: string): Promise<void>;
  getReminderPreferences(userId: string): Promise<ReminderPreferencesRecord>;
  upsertReminderPreferences(userId: string, input: CreateReminderPreferencesInput): Promise<ReminderPreferencesRecord>;
  runNotificationChecks(userId?: string, now?: Date): Promise<NotificationCheckResult>;
  deleteUserData(userId: string): Promise<void>;
}

export class IdempotencyConflictError extends Error {
  constructor(message = "An expense with this idempotency key already exists for a different payload.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class ExpenseNotFoundError extends Error {
  constructor(message = "Expense not found.") {
    super(message);
    this.name = "ExpenseNotFoundError";
  }
}

export class BudgetNotFoundError extends Error {
  constructor(message = "Budget not found.") {
    super(message);
    this.name = "BudgetNotFoundError";
  }
}

export class WalletNotFoundError extends Error {
  constructor(message = "Wallet not found.") {
    super(message);
    this.name = "WalletNotFoundError";
  }
}

export class WalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletValidationError";
  }
}

export class WalletBudgetNotFoundError extends Error {
  constructor(message = "Wallet budget not found.") {
    super(message);
    this.name = "WalletBudgetNotFoundError";
  }
}

export class NotificationNotFoundError extends Error {
  constructor(message = "Notification not found.") {
    super(message);
    this.name = "NotificationNotFoundError";
  }
}

export class WalletExpenseNotFoundError extends Error {
  constructor(message = "Shared expense not found.") {
    super(message);
    this.name = "WalletExpenseNotFoundError";
  }
}

export class WalletSettlementNotFoundError extends Error {
  constructor(message = "Settlement not found.") {
    super(message);
    this.name = "WalletSettlementNotFoundError";
  }
}

export class BillReminderNotFoundError extends Error {
  constructor(message = "Bill reminder not found.") {
    super(message);
    this.name = "BillReminderNotFoundError";
  }
}

export class WalletInviteNotFoundError extends Error {
  constructor(message = "Wallet invite not found.") {
    super(message);
    this.name = "WalletInviteNotFoundError";
  }
}