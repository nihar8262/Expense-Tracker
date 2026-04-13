import postgres, { type Sql, type TransactionSql } from "postgres";
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
  WalletValidationError
} from "./types.js";

type DbClient = Sql | TransactionSql;

type ExpenseRow = {
  id: string;
  amount_minor: number | string;
  category: string;
  description: string;
  expense_date: string | Date;
  created_at: string | Date;
};

type IdempotencyRow = {
  request_hash: string;
  expense_id: string;
};

type BudgetRow = {
  id: string;
  amount_minor: number | string;
  budget_scope: "monthly" | "category";
  category: string | null;
  budget_month: string;
  created_at: string | Date;
};

type WalletRow = {
  id: string;
  name: string;
  description: string | null;
  default_split_rule: "equal" | "fixed" | "percentage";
  created_at: string | Date;
};

type WalletBudgetRow = {
  id: string;
  wallet_id: string;
  amount_minor: number | string;
  budget_scope: "monthly" | "category";
  category: string | null;
  budget_month: string;
  created_at: string | Date;
};

type WalletMemberRow = {
  id: string;
  wallet_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  member_role: "owner" | "member";
  invite_status: "linked" | "pending" | "declined";
  joined_at: string | Date;
};

type WalletExpenseRow = {
  id: string;
  wallet_id: string;
  paid_by_member_id: string;
  paid_by_member_name: string;
  amount_minor: number | string;
  category: string;
  description: string;
  expense_date: string | Date;
  split_rule: "equal" | "fixed" | "percentage";
  created_at: string | Date;
};

type WalletExpenseSplitRow = {
  wallet_expense_id: string;
  member_id: string;
  member_name: string;
  amount_minor: number | string;
  percentage_basis_points: number | null;
};

type WalletSettlementRow = {
  id: string;
  wallet_id: string;
  from_member_id: string;
  from_member_name: string;
  to_member_id: string;
  to_member_name: string;
  amount_minor: number | string;
  settlement_date: string | Date;
  note: string | null;
  created_at: string | Date;
};

type NotificationRow = {
  id: string;
  user_id: string;
  notification_type: "budget-threshold" | "budget-overspent" | "daily-log" | "bill-due" | "wallet-invite";
  title: string;
  message: string;
  notification_status: "unread" | "read";
  created_at: string | Date;
  scheduled_for: string | Date | null;
  metadata_json: string | null;
  dedupe_key: string;
};

type BillReminderRow = {
  id: string;
  user_id: string;
  title: string;
  amount_minor: number | string | null;
  category: string | null;
  due_date: string | Date;
  recurrence: "once" | "weekly" | "monthly" | "yearly";
  interval_count: number;
  reminder_days_before: number;
  is_active: boolean;
  created_at: string | Date;
};

type ReminderPreferencesRow = {
  user_id: string;
  daily_logging_enabled: boolean;
  daily_logging_hour: number;
  budget_alerts_enabled: boolean;
  budget_alert_threshold: number;
  updated_at: string | Date;
};

const DEFAULT_REMINDER_PREFERENCES = {
  dailyLoggingEnabled: true,
  dailyLoggingHour: 20,
  budgetAlertsEnabled: true,
  budgetAlertThreshold: 80
} as const;

declare global {
  var __expenseTrackerSql__: Sql | undefined;
  var __expenseTrackerSchemaReady__: Promise<void> | undefined;
}

function asIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function asIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapExpense(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    category: row.category,
    description: row.description,
    date: asIsoDate(row.expense_date),
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapBudget(row: BudgetRow): BudgetRecord {
  return {
    id: row.id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    scope: row.budget_scope,
    category: row.category,
    month: row.budget_month,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapWalletBudget(row: WalletBudgetRow): WalletBudgetRecord {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    scope: row.budget_scope,
    category: row.category,
    month: row.budget_month,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapWallet(row: WalletRow): WalletRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    default_split_rule: row.default_split_rule,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapWalletMember(row: WalletMemberRow): WalletMemberRecord {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    user_id: row.user_id,
    display_name: row.display_name,
    email: row.email,
    role: row.member_role,
    invite_status: row.invite_status,
    joined_at: asIsoTimestamp(row.joined_at)
  };
}

function mapBillReminder(row: BillReminderRow): BillReminderRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    amount: row.amount_minor === null ? null : formatMinorUnits(Number(row.amount_minor)),
    category: row.category,
    due_date: asIsoDate(row.due_date),
    recurrence: row.recurrence,
    interval_count: row.interval_count,
    reminder_days_before: row.reminder_days_before,
    is_active: row.is_active,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    status: row.notification_status,
    created_at: asIsoTimestamp(row.created_at),
    scheduled_for: row.scheduled_for ? asIsoTimestamp(row.scheduled_for) : null,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, string>) : null
  };
}

function mapReminderPreferences(row: ReminderPreferencesRow): ReminderPreferencesRecord {
  return {
    daily_logging_enabled: row.daily_logging_enabled,
    daily_logging_hour: row.daily_logging_hour,
    budget_alerts_enabled: row.budget_alerts_enabled,
    budget_alert_threshold: row.budget_alert_threshold,
    updated_at: asIsoTimestamp(row.updated_at)
  };
}

function getTodayIsoDate(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

function getCurrentMonth(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addRecurrence(date: Date, recurrence: BillReminderRow["recurrence"], intervalCount: number): Date {
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

function getUpcomingBillDueDate(billReminder: BillReminderRow, now: Date): string | null {
  if (!billReminder.is_active) {
    return null;
  }

  let dueDate = new Date(`${asIsoDate(billReminder.due_date)}T00:00:00.000Z`);
  const currentDate = new Date(`${getTodayIsoDate(now)}T00:00:00.000Z`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  if (billReminder.recurrence === "once") {
    return dueDate >= currentDate || addDays(dueDate, billReminder.reminder_days_before + 1) >= currentDate ? asIsoDate(billReminder.due_date) : null;
  }

  while (addDays(dueDate, billReminder.reminder_days_before + 1) < currentDate) {
    dueDate = addRecurrence(dueDate, billReminder.recurrence, billReminder.interval_count);
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

  const totalAllocated = rawAllocations.reduce((sum, split) => sum + split.amountMinor, 0);
  const remainingMinorUnits = totalAmount - totalAllocated;

  rawAllocations
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, remainingMinorUnits)
    .forEach((split) => {
      split.amountMinor += 1;
    });

  return rawAllocations.map((split) => ({
    memberId: split.memberId,
    amountMinor: split.amountMinor,
    percentageBasisPoints: split.percentageBasisPoints
  }));
}

function getSqlClient(): Sql {
  if (globalThis.__expenseTrackerSql__) {
    return globalThis.__expenseTrackerSql__;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  });

  globalThis.__expenseTrackerSql__ = sql;
  return sql;
}

async function ensureSchema(sql: Sql): Promise<void> {
  if (!globalThis.__expenseTrackerSchemaReady__) {
    globalThis.__expenseTrackerSchemaReady__ = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY,
          user_id TEXT,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          category VARCHAR(64) NOT NULL,
          description VARCHAR(280) NOT NULL,
          expense_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT`;
      await sql`UPDATE expenses SET user_id = 'legacy-anonymous' WHERE user_id IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS expenses_user_id_expense_date_idx ON expenses (user_id, expense_date DESC, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS idempotency_requests (
          idempotency_key VARCHAR(255) PRIMARY KEY,
          request_hash TEXT NOT NULL,
          expense_id UUID NOT NULL REFERENCES expenses(id),
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS budgets (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')),
          category VARCHAR(64),
          budget_month CHAR(7) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          CHECK (
            (budget_scope = 'monthly' AND category IS NULL)
            OR (budget_scope = 'category' AND category IS NOT NULL)
          )
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS budgets_user_id_budget_month_idx ON budgets (user_id, budget_month DESC, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS wallets (
          id UUID PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          name VARCHAR(120) NOT NULL,
          description VARCHAR(280),
          default_split_rule VARCHAR(16) NOT NULL CHECK (default_split_rule IN ('equal', 'fixed', 'percentage')),
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS wallet_budgets (
          id UUID PRIMARY KEY,
          wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')),
          category VARCHAR(64),
          budget_month CHAR(7) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          CHECK (
            (budget_scope = 'monthly' AND category IS NULL)
            OR (budget_scope = 'category' AND category IS NOT NULL)
          )
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS wallet_budgets_wallet_id_budget_month_idx ON wallet_budgets (wallet_id, budget_month DESC, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS wallet_members (
          id UUID PRIMARY KEY,
          wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
          user_id TEXT,
          display_name VARCHAR(120) NOT NULL,
          email VARCHAR(160),
          member_role VARCHAR(16) NOT NULL CHECK (member_role IN ('owner', 'member')),
          invite_status VARCHAR(16) NOT NULL DEFAULT 'linked' CHECK (invite_status IN ('linked', 'pending', 'declined')),
          joined_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS wallet_members_wallet_id_idx ON wallet_members (wallet_id, joined_at ASC)`;
      await sql`CREATE INDEX IF NOT EXISTS wallet_members_user_id_idx ON wallet_members (user_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS wallet_expenses (
          id UUID PRIMARY KEY,
          wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
          paid_by_member_id UUID NOT NULL REFERENCES wallet_members(id),
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          category VARCHAR(64) NOT NULL,
          description VARCHAR(280) NOT NULL,
          expense_date DATE NOT NULL,
          split_rule VARCHAR(16) NOT NULL CHECK (split_rule IN ('equal', 'fixed', 'percentage')),
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS wallet_expenses_wallet_id_idx ON wallet_expenses (wallet_id, expense_date DESC, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS wallet_expense_splits (
          wallet_expense_id UUID NOT NULL REFERENCES wallet_expenses(id) ON DELETE CASCADE,
          member_id UUID NOT NULL REFERENCES wallet_members(id),
          amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
          percentage_basis_points INTEGER,
          PRIMARY KEY (wallet_expense_id, member_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS wallet_settlements (
          id UUID PRIMARY KEY,
          wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
          from_member_id UUID NOT NULL REFERENCES wallet_members(id),
          to_member_id UUID NOT NULL REFERENCES wallet_members(id),
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          settlement_date DATE NOT NULL,
          note VARCHAR(280),
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS wallet_settlements_wallet_id_idx ON wallet_settlements (wallet_id, settlement_date DESC, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN ('budget-threshold', 'budget-overspent', 'daily-log', 'bill-due', 'wallet-invite')),
          title VARCHAR(120) NOT NULL,
          message VARCHAR(280) NOT NULL,
          notification_status VARCHAR(16) NOT NULL CHECK (notification_status IN ('unread', 'read')),
          scheduled_for TIMESTAMPTZ,
          metadata_json TEXT,
          dedupe_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          UNIQUE (user_id, dedupe_key)
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS reminder_preferences (
          user_id TEXT PRIMARY KEY,
          daily_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          daily_logging_hour INTEGER NOT NULL DEFAULT 20 CHECK (daily_logging_hour BETWEEN 0 AND 23),
          budget_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          budget_alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (budget_alert_threshold BETWEEN 1 AND 100),
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS bill_reminders (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          title VARCHAR(120) NOT NULL,
          amount_minor BIGINT,
          category VARCHAR(64),
          due_date DATE NOT NULL,
          recurrence VARCHAR(16) NOT NULL CHECK (recurrence IN ('once', 'weekly', 'monthly', 'yearly')),
          interval_count INTEGER NOT NULL CHECK (interval_count >= 1 AND interval_count <= 24),
          reminder_days_before INTEGER NOT NULL CHECK (reminder_days_before >= 0 AND reminder_days_before <= 60),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`ALTER TABLE wallet_members ADD COLUMN IF NOT EXISTS invite_status VARCHAR(16) NOT NULL DEFAULT 'linked'`;
      await sql`ALTER TABLE wallet_members DROP CONSTRAINT IF EXISTS wallet_members_invite_status_check`;
      await sql`ALTER TABLE wallet_members ADD CONSTRAINT wallet_members_invite_status_check CHECK (invite_status IN ('linked', 'pending', 'declined'))`;
      await sql`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check`;
      await sql`ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN ('budget-threshold', 'budget-overspent', 'daily-log', 'bill-due', 'wallet-invite'))`;
      await sql`CREATE INDEX IF NOT EXISTS bill_reminders_user_id_due_date_idx ON bill_reminders (user_id, due_date ASC, created_at ASC)`;
    })();
  }

  await globalThis.__expenseTrackerSchemaReady__;
}

async function getExistingExpense(tx: DbClient, idempotencyKey: string, requestHash: string): Promise<CreateExpenseResult | null> {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

  const existingRequests = await tx<IdempotencyRow[]>`
    SELECT request_hash, expense_id
    FROM idempotency_requests
    WHERE idempotency_key = ${idempotencyKey}
  `;

  const existingRequest = existingRequests[0];

  if (!existingRequest) {
    return null;
  }

  if (existingRequest.request_hash !== requestHash) {
    throw new IdempotencyConflictError();
  }

  const expenseRows = await tx<ExpenseRow[]>`
    SELECT id, amount_minor, category, description, expense_date, created_at
    FROM expenses
    WHERE id = ${existingRequest.expense_id}
  `;

  const expense = expenseRows[0];

  if (!expense) {
    throw new Error("Stored idempotency record is missing its expense.");
  }

  return {
    expense: mapExpense(expense),
    created: false
  };
}

async function ensureWalletAccess(db: DbClient, userId: string, walletId: string): Promise<void> {
  const rows = await db<{ id: string }[]>`
    SELECT wallets.id
    FROM wallets
    INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id
    WHERE wallets.id = ${walletId} AND wallet_members.user_id = ${userId}
    LIMIT 1
  `;

  if (!rows[0]) {
    throw new WalletNotFoundError();
  }
}

async function loadWalletMembers(db: DbClient, walletId: string): Promise<WalletMemberRow[]> {
  return db<WalletMemberRow[]>`
    SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at
    FROM wallet_members
    WHERE wallet_id = ${walletId}
    ORDER BY joined_at ASC
  `;
}

async function loadReminderPreferencesRow(db: DbClient, userId: string): Promise<ReminderPreferencesRow | null> {
  const rows = await db<ReminderPreferencesRow[]>`
    SELECT user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at
    FROM reminder_preferences
    WHERE user_id = ${userId}
  `;

  return rows[0] ?? null;
}

async function upsertNotification(
  db: DbClient,
  input: {
    userId: string;
    type: NotificationRow["notification_type"];
    title: string;
    message: string;
    scheduledFor: string | null;
    metadata: Record<string, string> | null;
    dedupeKey: string;
  }
): Promise<NotificationRecord | null> {
  const rows = await db<NotificationRow[]>`
    INSERT INTO notifications (
      id,
      user_id,
      notification_type,
      title,
      message,
      notification_status,
      scheduled_for,
      metadata_json,
      dedupe_key,
      created_at
    ) VALUES (
      ${randomUUID()},
      ${input.userId},
      ${input.type},
      ${input.title},
      ${input.message},
      ${"unread"},
      ${input.scheduledFor},
      ${input.metadata ? JSON.stringify(input.metadata) : null},
      ${input.dedupeKey},
      ${new Date().toISOString()}
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING
    RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key
  `;

  return rows[0] ? mapNotification(rows[0]) : null;
}

async function loadWalletDetail(db: DbClient, walletId: string): Promise<WalletDetailRecord> {
  const walletRows = await db<WalletRow[]>`
    SELECT id, name, description, default_split_rule, created_at
    FROM wallets
    WHERE id = ${walletId}
  `;

  const wallet = walletRows[0];

  if (!wallet) {
    throw new WalletNotFoundError();
  }

  const members = await loadWalletMembers(db, walletId);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const walletBudgetRows = await db<WalletBudgetRow[]>`
    SELECT id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at
    FROM wallet_budgets
    WHERE wallet_id = ${walletId}
    ORDER BY budget_month DESC, created_at DESC
  `;

  const expenseRows = await db<WalletExpenseRow[]>`
    SELECT wallet_expenses.id,
           wallet_expenses.wallet_id,
           wallet_expenses.paid_by_member_id,
           payer.display_name AS paid_by_member_name,
           wallet_expenses.amount_minor,
           wallet_expenses.category,
           wallet_expenses.description,
           wallet_expenses.expense_date,
           wallet_expenses.split_rule,
           wallet_expenses.created_at
    FROM wallet_expenses
    INNER JOIN wallet_members AS payer ON payer.id = wallet_expenses.paid_by_member_id
    WHERE wallet_expenses.wallet_id = ${walletId}
    ORDER BY wallet_expenses.expense_date DESC, wallet_expenses.created_at DESC
  `;

  const splitRows = await db<WalletExpenseSplitRow[]>`
    SELECT wallet_expense_splits.wallet_expense_id,
           wallet_expense_splits.member_id,
           wallet_members.display_name AS member_name,
           wallet_expense_splits.amount_minor,
           wallet_expense_splits.percentage_basis_points
    FROM wallet_expense_splits
    INNER JOIN wallet_members ON wallet_members.id = wallet_expense_splits.member_id
    INNER JOIN wallet_expenses ON wallet_expenses.id = wallet_expense_splits.wallet_expense_id
    WHERE wallet_expenses.wallet_id = ${walletId}
    ORDER BY wallet_expense_splits.wallet_expense_id ASC, wallet_members.joined_at ASC
  `;

  const splitsByExpenseId = new Map<string, WalletExpenseSplitRecord[]>();

  for (const split of splitRows) {
    const existingSplits = splitsByExpenseId.get(split.wallet_expense_id) ?? [];
    existingSplits.push({
      member_id: split.member_id,
      member_name: split.member_name,
      amount: formatMinorUnits(Number(split.amount_minor)),
      percentage: split.percentage_basis_points === null ? null : split.percentage_basis_points / 100
    });
    splitsByExpenseId.set(split.wallet_expense_id, existingSplits);
  }

  const expenses: WalletExpenseRecord[] = expenseRows.map((expense) => ({
    id: expense.id,
    wallet_id: expense.wallet_id,
    paid_by_member_id: expense.paid_by_member_id,
    paid_by_member_name: expense.paid_by_member_name,
    amount: formatMinorUnits(Number(expense.amount_minor)),
    category: expense.category,
    description: expense.description,
    date: asIsoDate(expense.expense_date),
    split_rule: expense.split_rule,
    created_at: asIsoTimestamp(expense.created_at),
    splits: splitsByExpenseId.get(expense.id) ?? []
  }));

  const settlementRows = await db<WalletSettlementRow[]>`
    SELECT wallet_settlements.id,
           wallet_settlements.wallet_id,
           wallet_settlements.from_member_id,
           from_member.display_name AS from_member_name,
           wallet_settlements.to_member_id,
           to_member.display_name AS to_member_name,
           wallet_settlements.amount_minor,
           wallet_settlements.settlement_date,
           wallet_settlements.note,
           wallet_settlements.created_at
    FROM wallet_settlements
    INNER JOIN wallet_members AS from_member ON from_member.id = wallet_settlements.from_member_id
    INNER JOIN wallet_members AS to_member ON to_member.id = wallet_settlements.to_member_id
    WHERE wallet_settlements.wallet_id = ${walletId}
    ORDER BY wallet_settlements.settlement_date DESC, wallet_settlements.created_at DESC
  `;

  const settlements: WalletSettlementRecord[] = settlementRows.map((settlement) => ({
    id: settlement.id,
    wallet_id: settlement.wallet_id,
    from_member_id: settlement.from_member_id,
    from_member_name: settlement.from_member_name,
    to_member_id: settlement.to_member_id,
    to_member_name: settlement.to_member_name,
    amount: formatMinorUnits(Number(settlement.amount_minor)),
    date: asIsoDate(settlement.settlement_date),
    note: settlement.note,
    created_at: asIsoTimestamp(settlement.created_at)
  }));

  const balancesByMember = new Map(members.map((member) => [member.id, 0]));

  for (const expense of expenseRows) {
    balancesByMember.set(expense.paid_by_member_id, (balancesByMember.get(expense.paid_by_member_id) ?? 0) + Number(expense.amount_minor));
  }

  for (const split of splitRows) {
    balancesByMember.set(split.member_id, (balancesByMember.get(split.member_id) ?? 0) - Number(split.amount_minor));
  }

  for (const settlement of settlementRows) {
    balancesByMember.set(settlement.from_member_id, (balancesByMember.get(settlement.from_member_id) ?? 0) + Number(settlement.amount_minor));
    balancesByMember.set(settlement.to_member_id, (balancesByMember.get(settlement.to_member_id) ?? 0) - Number(settlement.amount_minor));
  }

  const balances: WalletBalanceRecord[] = members
    .map((member) => ({
      member_id: member.id,
      member_name: member.display_name,
      net_amount: formatMinorUnits(balancesByMember.get(member.id) ?? 0)
    }))
    .sort((left, right) => Number(right.net_amount) - Number(left.net_amount));

  return {
    wallet: mapWallet(wallet),
    members: members.map(mapWalletMember),
    budgets: walletBudgetRows.map(mapWalletBudget),
    expenses,
    balances,
    settlements
  };
}

export function createPostgresExpenseStore(): ExpenseStore {
  const sql = getSqlClient();

  return {
    async createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<CreateExpenseResult> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        const scopedIdempotencyKey = `${userId}:${idempotencyKey}`;
        const requestHash = createExpenseRequestHash(input);
        const existingExpense = await getExistingExpense(tx, scopedIdempotencyKey, requestHash);

        if (existingExpense) {
          return existingExpense;
        }

        const expenseId = randomUUID();
        const createdAt = new Date().toISOString();

        const insertedExpenses = await tx<ExpenseRow[]>`
          INSERT INTO expenses (id, user_id, amount_minor, category, description, expense_date, created_at)
          VALUES (${expenseId}, ${userId}, ${input.amount}, ${input.category.trim()}, ${input.description.trim()}, ${input.date}, ${createdAt})
          RETURNING id, amount_minor, category, description, expense_date, created_at
        `;

        await tx`
          INSERT INTO idempotency_requests (idempotency_key, request_hash, expense_id, created_at)
          VALUES (${scopedIdempotencyKey}, ${requestHash}, ${expenseId}, ${createdAt})
        `;

        return {
          expense: mapExpense(insertedExpenses[0]),
          created: true
        };
      });
    },

    async listExpenses(userId: string, query: ExpensesQueryInput): Promise<ExpenseRecord[]> {
      await ensureSchema(sql);

      const whereClause = query.category ? sql`WHERE user_id = ${userId} AND category = ${query.category}` : sql`WHERE user_id = ${userId}`;
      const orderClause = query.sort === "date_desc" ? sql`ORDER BY expense_date DESC, created_at DESC` : sql`ORDER BY created_at DESC`;

      const rows = await sql<ExpenseRow[]>`
        SELECT id, amount_minor, category, description, expense_date, created_at
        FROM expenses
        ${whereClause}
        ${orderClause}
      `;

      return rows.map(mapExpense);
    },

    async updateExpense(userId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
      await ensureSchema(sql);

      const updatedRows = await sql<ExpenseRow[]>`
        UPDATE expenses
        SET amount_minor = ${input.amount},
            category = ${input.category.trim()},
            description = ${input.description.trim()},
            expense_date = ${input.date}
        WHERE id = ${expenseId} AND user_id = ${userId}
        RETURNING id, amount_minor, category, description, expense_date, created_at
      `;

      if (!updatedRows[0]) {
        throw new ExpenseNotFoundError();
      }

      return mapExpense(updatedRows[0]);
    },

    async deleteExpense(userId: string, expenseId: string): Promise<void> {
      await ensureSchema(sql);

      await sql.begin(async (tx) => {
        const expenseRows = await tx<ExpenseRow[]>`
          SELECT id, amount_minor, category, description, expense_date, created_at
          FROM expenses
          WHERE id = ${expenseId} AND user_id = ${userId}
        `;

        if (!expenseRows[0]) {
          throw new ExpenseNotFoundError();
        }

        await tx`DELETE FROM idempotency_requests WHERE expense_id = ${expenseId}`;
        await tx`DELETE FROM expenses WHERE id = ${expenseId} AND user_id = ${userId}`;
      });
    },

    async createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
      await ensureSchema(sql);

      const insertedRows = await sql<BudgetRow[]>`
        INSERT INTO budgets (id, user_id, amount_minor, budget_scope, category, budget_month, created_at)
        VALUES (
          ${randomUUID()},
          ${userId},
          ${input.amount},
          ${input.scope},
          ${input.scope === "category" ? input.category?.trim() ?? null : null},
          ${input.month},
          ${new Date().toISOString()}
        )
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      return mapBudget(insertedRows[0]);
    },

    async listBudgets(userId: string): Promise<BudgetRecord[]> {
      await ensureSchema(sql);

      const rows = await sql<BudgetRow[]>`
        SELECT id, amount_minor, budget_scope, category, budget_month, created_at
        FROM budgets
        WHERE user_id = ${userId}
        ORDER BY budget_month DESC, created_at DESC
      `;

      return rows.map(mapBudget);
    },

    async updateBudget(userId: string, budgetId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
      await ensureSchema(sql);

      const updatedRows = await sql<BudgetRow[]>`
        UPDATE budgets
        SET amount_minor = ${input.amount},
            budget_scope = ${input.scope},
            category = ${input.scope === "category" ? input.category?.trim() ?? null : null},
            budget_month = ${input.month}
        WHERE id = ${budgetId} AND user_id = ${userId}
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      if (!updatedRows[0]) {
        throw new BudgetNotFoundError();
      }

      return mapBudget(updatedRows[0]);
    },

    async deleteBudget(userId: string, budgetId: string): Promise<void> {
      await ensureSchema(sql);

      const deletedRows = await sql<BudgetRow[]>`
        DELETE FROM budgets
        WHERE id = ${budgetId} AND user_id = ${userId}
        RETURNING id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      if (!deletedRows[0]) {
        throw new BudgetNotFoundError();
      }
    },

    async createWallet(userId: string, ownerProfile: { name: string | null; email: string | null }, input: CreateWalletInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        const walletId = randomUUID();
        const createdAt = new Date().toISOString();

        await tx`
          INSERT INTO wallets (id, owner_user_id, name, description, default_split_rule, created_at)
          VALUES (${walletId}, ${userId}, ${input.name.trim()}, ${input.description?.trim() || null}, ${input.defaultSplitRule}, ${createdAt})
        `;

        await tx`
          INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at)
          VALUES (
            ${randomUUID()},
            ${walletId},
            ${userId},
            ${ownerProfile.name?.trim() || ownerProfile.email?.trim() || "You"},
            ${ownerProfile.email?.trim() || null},
            ${"owner"},
            ${"linked"},
            ${createdAt}
          )
        `;

        for (const member of input.members) {
          const normalizedName = member.displayName.trim();
          const ownerName = ownerProfile.name?.trim() || ownerProfile.email?.trim() || "You";

          if (normalizedName.toLowerCase() === ownerName.toLowerCase()) {
            continue;
          }

          await tx`
            INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at)
            VALUES (${randomUUID()}, ${walletId}, ${null}, ${normalizedName}, ${member.email?.trim().toLowerCase() || null}, ${"member"}, ${member.email?.trim() ? "pending" : "linked"}, ${createdAt})
          `;
        }

        return loadWalletDetail(tx, walletId);
      });
    },

    async createWalletMember(userId: string, walletId: string, input: CreateWalletMemberInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        const walletRows = await tx<{ owner_user_id: string }[]>`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
        const wallet = walletRows[0];

        if (!wallet) {
          throw new WalletNotFoundError();
        }

        await ensureWalletAccess(tx, userId, walletId);

        if (wallet.owner_user_id !== userId) {
          throw new WalletValidationError("Only the wallet owner can invite members.");
        }

        const normalizedName = input.displayName.trim();
        const normalizedEmail = input.email?.trim().toLowerCase() || null;
        const existingRows = normalizedEmail
          ? await tx<WalletMemberRow[]>`SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at FROM wallet_members WHERE wallet_id = ${walletId} AND lower(email) = ${normalizedEmail}`
          : await tx<WalletMemberRow[]>`SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at FROM wallet_members WHERE wallet_id = ${walletId} AND lower(display_name) = ${normalizedName.toLowerCase()}`;

        if (existingRows[0]) {
          throw new WalletValidationError("That member is already part of this wallet.");
        }

        await tx`
          INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at)
          VALUES (${randomUUID()}, ${walletId}, ${null}, ${normalizedName}, ${normalizedEmail}, ${"member"}, ${normalizedEmail ? "pending" : "linked"}, ${new Date().toISOString()})
        `;

        return loadWalletDetail(tx, walletId);
      });
    },

    async linkWalletInvites(userId: string, profile: { email: string | null; name: string | null }): Promise<number> {
      await ensureSchema(sql);

      const normalizedEmail = profile.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        return 0;
      }

      const pendingInvites = await sql<{ id: string; wallet_id: string; wallet_name: string }[]>`
        SELECT wallet_members.id, wallet_members.wallet_id, wallets.name AS wallet_name
        FROM wallet_members
        INNER JOIN wallets ON wallets.id = wallet_members.wallet_id
        WHERE wallet_members.user_id IS NULL
          AND wallet_members.invite_status = ${"pending"}
          AND lower(wallet_members.email) = ${normalizedEmail}
      `;

      let linkedCount = 0;

      for (const invite of pendingInvites) {
        const notification = await upsertNotification(sql, {
          userId,
          type: "wallet-invite",
          title: `You were added to ${invite.wallet_name}`,
          message: `Review your invite to join ${invite.wallet_name}.`,
          scheduledFor: null,
          metadata: {
            walletId: invite.wallet_id,
            walletMemberId: invite.id,
            walletName: invite.wallet_name
          },
          dedupeKey: `wallet-invite:${invite.id}`
        });

        if (notification) {
          linkedCount += 1;
        }
      }

      return linkedCount;
    },

    async respondToWalletInvite(userId: string, profile: { email: string | null; name: string | null }, walletMemberId: string, action: "accept" | "decline"): Promise<void> {
      await ensureSchema(sql);

      const normalizedEmail = profile.email?.trim().toLowerCase();

      if (!normalizedEmail) {
        throw new WalletInviteNotFoundError();
      }

      await sql.begin(async (tx) => {
        const inviteRows = await tx<WalletMemberRow[]>`
          SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at
          FROM wallet_members
          WHERE id = ${walletMemberId}
            AND user_id IS NULL
            AND invite_status = ${"pending"}
            AND lower(email) = ${normalizedEmail}
        `;

        const invite = inviteRows[0];

        if (!invite) {
          throw new WalletInviteNotFoundError();
        }

        if (action === "accept") {
          await tx`
            UPDATE wallet_members
            SET user_id = ${userId},
                invite_status = ${"linked"},
                display_name = COALESCE(${profile.name?.trim() || null}, display_name)
            WHERE id = ${walletMemberId}
          `;
        } else {
          await tx`
            UPDATE wallet_members
            SET invite_status = ${"declined"}
            WHERE id = ${walletMemberId}
          `;
        }

        await tx`
          UPDATE notifications
          SET notification_status = ${"read"}
          WHERE user_id = ${userId}
            AND notification_type = ${"wallet-invite"}
            AND metadata_json IS NOT NULL
            AND metadata_json::jsonb ->> 'walletMemberId' = ${walletMemberId}
        `;
      });
    },

    async listWallets(userId: string): Promise<WalletRecord[]> {
      await ensureSchema(sql);

      const rows = await sql<WalletRow[]>`
        SELECT wallets.id, wallets.name, wallets.description, wallets.default_split_rule, wallets.created_at
        FROM wallets
        INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id
        WHERE wallet_members.user_id = ${userId}
        ORDER BY wallets.created_at DESC
      `;

      return rows.map(mapWallet);
    },

    async getWallet(userId: string, walletId: string): Promise<WalletDetailRecord> {
      await ensureSchema(sql);
      await ensureWalletAccess(sql, userId, walletId);
      return loadWalletDetail(sql, walletId);
    },

    async deleteWallet(userId: string, walletId: string): Promise<void> {
      await ensureSchema(sql);

      await sql.begin(async (tx) => {
        const walletRows = await tx<{ owner_user_id: string }[]>`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
        const wallet = walletRows[0];

        if (!wallet) {
          throw new WalletNotFoundError();
        }

        await ensureWalletAccess(tx, userId, walletId);

        if (wallet.owner_user_id !== userId) {
          throw new WalletValidationError("Only the wallet owner can delete this group.");
        }

        await tx`
          DELETE FROM notifications
          WHERE metadata_json IS NOT NULL
            AND metadata_json::jsonb ->> 'walletId' = ${walletId}
        `;

        await tx`DELETE FROM wallets WHERE id = ${walletId}`;
      });
    },

    async leaveWallet(userId: string, walletId: string): Promise<void> {
      await ensureSchema(sql);

      await sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);

        const membershipRows = await tx<WalletMemberRow[]>`
          SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at
          FROM wallet_members
          WHERE wallet_id = ${walletId} AND user_id = ${userId}
          LIMIT 1
        `;

        const membership = membershipRows[0];

        if (!membership) {
          throw new WalletNotFoundError();
        }

        if (membership.member_role === "owner") {
          throw new WalletValidationError("The wallet owner can delete the group instead of exiting it.");
        }

        const historyRows = await tx<{
          has_expenses: boolean;
          has_splits: boolean;
          has_settlements: boolean;
        }[]>`
          SELECT
            EXISTS(SELECT 1 FROM wallet_expenses WHERE paid_by_member_id = ${membership.id}) AS has_expenses,
            EXISTS(SELECT 1 FROM wallet_expense_splits WHERE member_id = ${membership.id}) AS has_splits,
            EXISTS(SELECT 1 FROM wallet_settlements WHERE from_member_id = ${membership.id} OR to_member_id = ${membership.id}) AS has_settlements
        `;

        const hasHistory = Boolean(historyRows[0]?.has_expenses || historyRows[0]?.has_splits || historyRows[0]?.has_settlements);

        if (hasHistory) {
          await tx`
            UPDATE wallet_members
            SET user_id = ${null},
                email = ${null},
                invite_status = ${"declined"}
            WHERE id = ${membership.id}
          `;
        } else {
          await tx`DELETE FROM wallet_members WHERE id = ${membership.id}`;
        }

        await tx`
          DELETE FROM notifications
          WHERE user_id = ${userId}
            AND metadata_json IS NOT NULL
            AND metadata_json::jsonb ->> 'walletId' = ${walletId}
        `;
      });
    },

    async createWalletBudget(userId: string, walletId: string, input: CreateBudgetInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);
      await ensureWalletAccess(sql, userId, walletId);

      await sql`
        INSERT INTO wallet_budgets (id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at)
        VALUES (
          ${randomUUID()},
          ${walletId},
          ${input.amount},
          ${input.scope},
          ${input.scope === "category" ? input.category?.trim() ?? null : null},
          ${input.month},
          ${new Date().toISOString()}
        )
      `;

      return loadWalletDetail(sql, walletId);
    },

    async updateWalletBudget(userId: string, walletId: string, walletBudgetId: string, input: CreateBudgetInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);
      await ensureWalletAccess(sql, userId, walletId);

      const updatedRows = await sql<WalletBudgetRow[]>`
        UPDATE wallet_budgets
        SET amount_minor = ${input.amount},
            budget_scope = ${input.scope},
            category = ${input.scope === "category" ? input.category?.trim() ?? null : null},
            budget_month = ${input.month}
        WHERE id = ${walletBudgetId} AND wallet_id = ${walletId}
        RETURNING id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      if (!updatedRows[0]) {
        throw new WalletBudgetNotFoundError();
      }

      return loadWalletDetail(sql, walletId);
    },

    async deleteWalletBudget(userId: string, walletId: string, walletBudgetId: string): Promise<WalletDetailRecord> {
      await ensureSchema(sql);
      await ensureWalletAccess(sql, userId, walletId);

      const deletedRows = await sql<WalletBudgetRow[]>`
        DELETE FROM wallet_budgets
        WHERE id = ${walletBudgetId} AND wallet_id = ${walletId}
        RETURNING id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at
      `;

      if (!deletedRows[0]) {
        throw new WalletBudgetNotFoundError();
      }

      return loadWalletDetail(sql, walletId);
    },

    async createWalletExpense(userId: string, walletId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);

        const members = await loadWalletMembers(tx, walletId);
        const memberIds = new Set(members.map((member) => member.id));

        if (!memberIds.has(input.paidByMemberId)) {
          throw new WalletValidationError("The selected payer does not belong to this wallet.");
        }

        for (const split of input.splits) {
          if (!memberIds.has(split.memberId)) {
            throw new WalletValidationError("One or more split members do not belong to this wallet.");
          }
        }

        const expenseId = randomUUID();
        const createdAt = new Date().toISOString();

        await tx`
          INSERT INTO wallet_expenses (id, wallet_id, paid_by_member_id, amount_minor, category, description, expense_date, split_rule, created_at)
          VALUES (
            ${expenseId},
            ${walletId},
            ${input.paidByMemberId},
            ${input.amount},
            ${input.category.trim()},
            ${input.description.trim()},
            ${input.date},
            ${input.splitRule},
            ${createdAt}
          )
        `;

        const splits =
          input.splitRule === "equal"
            ? buildEqualSplits(input.amount, input.splits.map((split) => split.memberId))
            : input.splitRule === "fixed"
              ? input.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null }))
              : buildPercentageSplits(input.amount, input.splits);

        for (const split of splits) {
          await tx`
            INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points)
            VALUES (${expenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})
          `;
        }

        return loadWalletDetail(tx, walletId);
      });
    },

    async updateWalletExpense(userId: string, walletId: string, walletExpenseId: string, input: CreateWalletExpenseInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);

        const expenseRows = await tx<{ id: string }[]>`SELECT id FROM wallet_expenses WHERE id = ${walletExpenseId} AND wallet_id = ${walletId}`;
        if (!expenseRows[0]) {
          throw new WalletExpenseNotFoundError();
        }

        const members = await loadWalletMembers(tx, walletId);
        const memberIds = new Set(members.map((member) => member.id));
        if (!memberIds.has(input.paidByMemberId) || input.splits.some((split) => !memberIds.has(split.memberId))) {
          throw new WalletValidationError("One or more wallet members are invalid for this shared expense.");
        }

        await tx`
          UPDATE wallet_expenses
          SET paid_by_member_id = ${input.paidByMemberId},
              amount_minor = ${input.amount},
              category = ${input.category.trim()},
              description = ${input.description.trim()},
              expense_date = ${input.date},
              split_rule = ${input.splitRule}
          WHERE id = ${walletExpenseId} AND wallet_id = ${walletId}
        `;

        await tx`DELETE FROM wallet_expense_splits WHERE wallet_expense_id = ${walletExpenseId}`;
        const splits = input.splitRule === "equal"
          ? buildEqualSplits(input.amount, input.splits.map((split) => split.memberId))
          : input.splitRule === "fixed"
            ? input.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null }))
            : buildPercentageSplits(input.amount, input.splits);

        for (const split of splits) {
          await tx`INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points) VALUES (${walletExpenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})`;
        }

        return loadWalletDetail(tx, walletId);
      });
    },

    async deleteWalletExpense(userId: string, walletId: string, walletExpenseId: string): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);

        const deletedRows = await tx<{ id: string }[]>`DELETE FROM wallet_expenses WHERE id = ${walletExpenseId} AND wallet_id = ${walletId} RETURNING id`;
        if (!deletedRows[0]) {
          throw new WalletExpenseNotFoundError();
        }

        return loadWalletDetail(tx, walletId);
      });
    },

    async createWalletSettlement(userId: string, walletId: string, input: CreateSettlementInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);

        const members = await loadWalletMembers(tx, walletId);
        const memberIds = new Set(members.map((member) => member.id));

        if (!memberIds.has(input.fromMemberId) || !memberIds.has(input.toMemberId)) {
          throw new WalletValidationError("Settlement members must belong to this wallet.");
        }

        await tx`
          INSERT INTO wallet_settlements (id, wallet_id, from_member_id, to_member_id, amount_minor, settlement_date, note, created_at)
          VALUES (
            ${randomUUID()},
            ${walletId},
            ${input.fromMemberId},
            ${input.toMemberId},
            ${input.amount},
            ${input.date},
            ${input.note?.trim() || null},
            ${new Date().toISOString()}
          )
        `;

        return loadWalletDetail(tx, walletId);
      });
    },

    async updateWalletSettlement(userId: string, walletId: string, settlementId: string, input: CreateSettlementInput): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);
        const settlementRows = await tx<{ id: string }[]>`SELECT id FROM wallet_settlements WHERE id = ${settlementId} AND wallet_id = ${walletId}`;
        if (!settlementRows[0]) {
          throw new WalletSettlementNotFoundError();
        }

        const members = await loadWalletMembers(tx, walletId);
        const memberIds = new Set(members.map((member) => member.id));
        if (!memberIds.has(input.fromMemberId) || !memberIds.has(input.toMemberId)) {
          throw new WalletValidationError("Settlement members must belong to this wallet.");
        }

        await tx`
          UPDATE wallet_settlements
          SET from_member_id = ${input.fromMemberId},
              to_member_id = ${input.toMemberId},
              amount_minor = ${input.amount},
              settlement_date = ${input.date},
              note = ${input.note?.trim() || null}
          WHERE id = ${settlementId} AND wallet_id = ${walletId}
        `;

        return loadWalletDetail(tx, walletId);
      });
    },

    async deleteWalletSettlement(userId: string, walletId: string, settlementId: string): Promise<WalletDetailRecord> {
      await ensureSchema(sql);

      return sql.begin(async (tx) => {
        await ensureWalletAccess(tx, userId, walletId);
        const deletedRows = await tx<{ id: string }[]>`DELETE FROM wallet_settlements WHERE id = ${settlementId} AND wallet_id = ${walletId} RETURNING id`;
        if (!deletedRows[0]) {
          throw new WalletSettlementNotFoundError();
        }
        return loadWalletDetail(tx, walletId);
      });
    },

    async listBillReminders(userId: string): Promise<BillReminderRecord[]> {
      await ensureSchema(sql);
      const rows = await sql<BillReminderRow[]>`SELECT id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at FROM bill_reminders WHERE user_id = ${userId} ORDER BY due_date ASC, created_at ASC`;
      return rows.map(mapBillReminder);
    },

    async createBillReminder(userId: string, input: CreateBillReminderInput): Promise<BillReminderRecord> {
      await ensureSchema(sql);
      const rows = await sql<BillReminderRow[]>`
        INSERT INTO bill_reminders (id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at)
        VALUES (${randomUUID()}, ${userId}, ${input.title.trim()}, ${input.amount}, ${input.category?.trim() || null}, ${input.dueDate}, ${input.recurrence}, ${input.intervalCount}, ${input.reminderDaysBefore}, ${input.isActive}, ${new Date().toISOString()})
        RETURNING id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at
      `;
      return mapBillReminder(rows[0]);
    },

    async updateBillReminder(userId: string, billReminderId: string, input: CreateBillReminderInput): Promise<BillReminderRecord> {
      await ensureSchema(sql);
      const rows = await sql<BillReminderRow[]>`
        UPDATE bill_reminders
        SET title = ${input.title.trim()},
            amount_minor = ${input.amount},
            category = ${input.category?.trim() || null},
            due_date = ${input.dueDate},
            recurrence = ${input.recurrence},
            interval_count = ${input.intervalCount},
            reminder_days_before = ${input.reminderDaysBefore},
            is_active = ${input.isActive}
        WHERE id = ${billReminderId} AND user_id = ${userId}
        RETURNING id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at
      `;
      if (!rows[0]) {
        throw new BillReminderNotFoundError();
      }
      return mapBillReminder(rows[0]);
    },

    async deleteBillReminder(userId: string, billReminderId: string): Promise<void> {
      await ensureSchema(sql);
      const rows = await sql<BillReminderRow[]>`DELETE FROM bill_reminders WHERE id = ${billReminderId} AND user_id = ${userId} RETURNING id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at`;
      if (!rows[0]) {
        throw new BillReminderNotFoundError();
      }
    },

    async listNotifications(userId: string): Promise<NotificationRecord[]> {
      await ensureSchema(sql);

      const rows = await sql<NotificationRow[]>`
        SELECT id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key
        FROM notifications
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

      return rows.map(mapNotification);
    },

    async markNotificationRead(userId: string, notificationId: string): Promise<NotificationRecord> {
      await ensureSchema(sql);

      const rows = await sql<NotificationRow[]>`
        UPDATE notifications
        SET notification_status = ${"read"}
        WHERE id = ${notificationId} AND user_id = ${userId}
        RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key
      `;

      if (!rows[0]) {
        throw new NotificationNotFoundError();
      }

      return mapNotification(rows[0]);
    },

    async markAllNotificationsRead(userId: string): Promise<void> {
      await ensureSchema(sql);
      await sql`UPDATE notifications SET notification_status = ${"read"} WHERE user_id = ${userId}`;
    },

    async deleteNotification(userId: string, notificationId: string): Promise<void> {
      await ensureSchema(sql);

      const rows = await sql<NotificationRow[]>`
        DELETE FROM notifications
        WHERE id = ${notificationId} AND user_id = ${userId}
        RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key
      `;

      if (!rows[0]) {
        throw new NotificationNotFoundError();
      }
    },

    async getReminderPreferences(userId: string): Promise<ReminderPreferencesRecord> {
      await ensureSchema(sql);

      const row = await loadReminderPreferencesRow(sql, userId);

      if (row) {
        return mapReminderPreferences(row);
      }

      return {
        daily_logging_enabled: DEFAULT_REMINDER_PREFERENCES.dailyLoggingEnabled,
        daily_logging_hour: DEFAULT_REMINDER_PREFERENCES.dailyLoggingHour,
        budget_alerts_enabled: DEFAULT_REMINDER_PREFERENCES.budgetAlertsEnabled,
        budget_alert_threshold: DEFAULT_REMINDER_PREFERENCES.budgetAlertThreshold,
        updated_at: new Date().toISOString()
      };
    },

    async upsertReminderPreferences(userId: string, input: CreateReminderPreferencesInput): Promise<ReminderPreferencesRecord> {
      await ensureSchema(sql);

      const rows = await sql<ReminderPreferencesRow[]>`
        INSERT INTO reminder_preferences (user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at)
        VALUES (${userId}, ${input.dailyLoggingEnabled}, ${input.dailyLoggingHour}, ${input.budgetAlertsEnabled}, ${input.budgetAlertThreshold}, ${new Date().toISOString()})
        ON CONFLICT (user_id)
        DO UPDATE SET
          daily_logging_enabled = EXCLUDED.daily_logging_enabled,
          daily_logging_hour = EXCLUDED.daily_logging_hour,
          budget_alerts_enabled = EXCLUDED.budget_alerts_enabled,
          budget_alert_threshold = EXCLUDED.budget_alert_threshold,
          updated_at = EXCLUDED.updated_at
        RETURNING user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at
      `;

      return mapReminderPreferences(rows[0]);
    },

    async runNotificationChecks(userId?: string, now = new Date()): Promise<NotificationCheckResult> {
      await ensureSchema(sql);

      const targetUserIds = userId
        ? [userId]
        : (
            await sql<{ user_id: string }[]>`
              SELECT DISTINCT user_id FROM (
                SELECT user_id FROM expenses
                UNION
                SELECT user_id FROM budgets
                UNION
                SELECT user_id FROM bill_reminders
                UNION
                SELECT user_id FROM reminder_preferences
              ) AS users
              WHERE user_id IS NOT NULL
            `
          ).map((row) => row.user_id);

      const createdNotifications: NotificationRecord[] = [];
      const currentDate = getTodayIsoDate(now);
      const currentMonth = getCurrentMonth(now);
      const currentHour = now.getHours();

      for (const targetUserId of targetUserIds) {
        const preferences = (await loadReminderPreferencesRow(sql, targetUserId)) ?? {
          user_id: targetUserId,
          daily_logging_enabled: DEFAULT_REMINDER_PREFERENCES.dailyLoggingEnabled,
          daily_logging_hour: DEFAULT_REMINDER_PREFERENCES.dailyLoggingHour,
          budget_alerts_enabled: DEFAULT_REMINDER_PREFERENCES.budgetAlertsEnabled,
          budget_alert_threshold: DEFAULT_REMINDER_PREFERENCES.budgetAlertThreshold,
          updated_at: now.toISOString()
        };

        if (preferences.daily_logging_enabled && currentHour >= preferences.daily_logging_hour) {
          const rows = await sql<{ count: string }[]>`
            SELECT COUNT(*)::text AS count
            FROM expenses
            WHERE user_id = ${targetUserId} AND expense_date = ${currentDate}
          `;

          if (Number(rows[0]?.count ?? "0") === 0) {
            const notification = await upsertNotification(sql, {
              userId: targetUserId,
              type: "daily-log",
              title: "Log today's spending",
              message: "You have not added any expenses today. Capture them before the day ends.",
              scheduledFor: `${currentDate}T${String(preferences.daily_logging_hour).padStart(2, "0")}:00:00.000Z`,
              metadata: { date: currentDate },
              dedupeKey: `daily-log:${currentDate}`
            });

            if (notification) {
              createdNotifications.push(notification);
            }
          }
        }

        if (!preferences.budget_alerts_enabled) {
        } else {
          const budgetRows = await sql<BudgetRow[]>`
            SELECT id, amount_minor, budget_scope, category, budget_month, created_at
            FROM budgets
            WHERE user_id = ${targetUserId} AND budget_month = ${currentMonth}
          `;

          for (const budget of budgetRows) {
            const spendRows = budget.budget_scope === "category"
              ? await sql<{ spent_minor: string }[]>`
                  SELECT COALESCE(SUM(amount_minor), 0)::text AS spent_minor
                  FROM expenses
                  WHERE user_id = ${targetUserId}
                    AND expense_date >= ${`${currentMonth}-01`}
                    AND expense_date < ${(new Date(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 10)}
                    AND category = ${budget.category}
                `
              : await sql<{ spent_minor: string }[]>`
                  SELECT COALESCE(SUM(amount_minor), 0)::text AS spent_minor
                  FROM expenses
                  WHERE user_id = ${targetUserId}
                    AND expense_date >= ${`${currentMonth}-01`}
                    AND expense_date < ${(new Date(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 10)}
                `;

            const spentMinor = Number(spendRows[0]?.spent_minor ?? "0");

            if (spentMinor <= 0) {
              continue;
            }

            if (spentMinor > Number(budget.amount_minor)) {
              const notification = await upsertNotification(sql, {
                userId: targetUserId,
                type: "budget-overspent",
                title: budget.budget_scope === "category" ? `${budget.category} budget exceeded` : "Monthly budget exceeded",
                message: `${formatMinorUnits(spentMinor)} spent against a ${formatMinorUnits(Number(budget.amount_minor))} budget for ${budget.budget_month}.`,
                scheduledFor: null,
                metadata: { budgetId: budget.id, month: budget.budget_month },
                dedupeKey: `budget-overspent:${budget.id}:${budget.budget_month}`
              });

              if (notification) {
                createdNotifications.push(notification);
              }

              continue;
            }

            const thresholdMinor = Math.ceil((Number(budget.amount_minor) * preferences.budget_alert_threshold) / 100);

            if (spentMinor >= thresholdMinor) {
              const notification = await upsertNotification(sql, {
                userId: targetUserId,
                type: "budget-threshold",
                title: budget.budget_scope === "category" ? `${budget.category} budget nearing limit` : "Monthly budget nearing limit",
                message: `${formatMinorUnits(spentMinor)} spent, which is ${preferences.budget_alert_threshold}% or more of your ${formatMinorUnits(Number(budget.amount_minor))} budget for ${budget.budget_month}.`,
                scheduledFor: null,
                metadata: { budgetId: budget.id, month: budget.budget_month },
                dedupeKey: `budget-threshold:${budget.id}:${budget.budget_month}:${preferences.budget_alert_threshold}`
              });

              if (notification) {
                createdNotifications.push(notification);
              }
            }
          }
        }

        const billReminderRows = await sql<BillReminderRow[]>`
          SELECT id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at
          FROM bill_reminders
          WHERE user_id = ${targetUserId}
        `;

        for (const billReminder of billReminderRows) {
          const nextDueDate = getUpcomingBillDueDate(billReminder, now);

          if (!nextDueDate) {
            continue;
          }

          const dueDate = new Date(`${nextDueDate}T00:00:00.000Z`);
          const reminderDate = addDays(dueDate, -billReminder.reminder_days_before);

          if (new Date(`${currentDate}T00:00:00.000Z`) < reminderDate) {
            continue;
          }

          const notification = await upsertNotification(sql, {
            userId: targetUserId,
            type: "bill-due",
            title: `${billReminder.title} is coming up`,
            message: `${billReminder.title}${billReminder.amount_minor === null ? "" : ` for ${formatMinorUnits(Number(billReminder.amount_minor))}`} is due on ${nextDueDate}.`,
            scheduledFor: reminderDate.toISOString(),
            metadata: { billReminderId: billReminder.id, dueDate: nextDueDate },
            dedupeKey: `bill-due:${billReminder.id}:${nextDueDate}`
          });

          if (notification) {
            createdNotifications.push(notification);
          }
        }
      }

      return {
        processed_user_count: targetUserIds.length,
        created_notifications: createdNotifications
      };
    },

    async deleteUserData(userId: string): Promise<void> {
      await ensureSchema(sql);

      await sql.begin(async (tx) => {
        await tx`
          DELETE FROM idempotency_requests
          WHERE idempotency_key LIKE ${`${userId}:%`}
             OR expense_id IN (
               SELECT id FROM expenses WHERE user_id = ${userId}
             )
        `;

        await tx`DELETE FROM expenses WHERE user_id = ${userId}`;
        await tx`DELETE FROM budgets WHERE user_id = ${userId}`;
        await tx`DELETE FROM notifications WHERE user_id = ${userId}`;
        await tx`DELETE FROM reminder_preferences WHERE user_id = ${userId}`;
        await tx`DELETE FROM bill_reminders WHERE user_id = ${userId}`;
        await tx`DELETE FROM wallets WHERE owner_user_id = ${userId}`;
      });
    }
  };
}