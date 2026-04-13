const { randomUUID } = require("node:crypto");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const postgres = require("postgres");
const { z } = require("zod");

class AuthenticationError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

class AuthenticationConfigurationError extends Error {
  constructor(message = "Firebase admin credentials are not configured.") {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

let sqlClient;
let schemaReady;

function parseAmountToMinorUnits(value) {
  const raw = typeof value === "number" ? value.toString() : String(value ?? "");
  const trimmed = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Amount must be a valid positive number with up to 2 decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const minorUnits = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));

  if (minorUnits <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large.");
  }

  return Number(minorUnits);
}

function parsePercentageToBasisPoints(value) {
  const raw = typeof value === "number" ? value.toString() : String(value ?? "");
  const trimmed = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Percentage must be a valid number with up to 2 decimal places.");
  }

  const basisPoints = Math.round(Number(trimmed) * 100);

  if (!Number.isFinite(basisPoints) || basisPoints <= 0 || basisPoints > 10000) {
    throw new Error("Percentage must be greater than zero and at most 100.");
  }

  return basisPoints;
}

function formatMinorUnits(value) {
  const whole = Math.trunc(value / 100);
  const fraction = Math.abs(value % 100)
    .toString()
    .padStart(2, "0");

  return `${whole}.${fraction}`;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).optional(),
  defaultSplitRule: z.enum(["equal", "fixed", "percentage"]).default("equal"),
  members: z.array(z.object({ displayName: z.string().trim().min(1).max(120), email: z.string().trim().max(160).optional() })).max(15).default([])
});

const createWalletMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().max(160).optional()
});

const walletInviteResponseSchema = z.object({
  action: z.enum(["accept", "decline"])
});

const createWalletExpenseSchema = z
  .object({
    paidByMemberId: z.string().trim().min(1),
    amount: z.union([z.string(), z.number()]).transform((value, context) => {
      try {
        return parseAmountToMinorUnits(value);
      } catch (error) {
        context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid amount." });
        return z.NEVER;
      }
    }),
    category: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(280),
    date: z.string().trim().refine(isValidIsoDate),
    splitRule: z.enum(["equal", "fixed", "percentage"]),
    splits: z.array(z.object({ memberId: z.string().trim().min(1), value: z.union([z.string(), z.number()]).optional() })).min(1)
  })
  .transform((value, context) => ({
    ...value,
    splits: value.splits.map((split, index) => {
      if (value.splitRule === "equal") {
        return { memberId: split.memberId, value: null };
      }

      if (split.value === undefined || split.value === null || String(split.value).trim() === "") {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["splits", index, "value"], message: value.splitRule === "fixed" ? "A fixed amount is required for each split." : "A percentage is required for each split." });
        return z.NEVER;
      }

      try {
        return {
          memberId: split.memberId,
          value: value.splitRule === "fixed" ? parseAmountToMinorUnits(split.value) : parsePercentageToBasisPoints(split.value)
        };
      } catch (error) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["splits", index, "value"], message: error instanceof Error ? error.message : "Invalid split value." });
        return z.NEVER;
      }
    })
  }))
  .superRefine((value, context) => {
    const memberIds = value.splits.map((split) => split.memberId);
    const uniqueIds = new Set(memberIds);
    if (memberIds.length !== uniqueIds.size) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["splits"], message: "Each member can only appear once in a split." });
    }
    if (!uniqueIds.has(value.paidByMemberId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["paidByMemberId"], message: "The payer must be included in the split members." });
    }
    if (value.splitRule === "fixed") {
      const total = value.splits.reduce((sum, split) => sum + (split.value ?? 0), 0);
      if (total !== value.amount) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["splits"], message: "Fixed split amounts must add up to the total expense amount." });
      }
    }
    if (value.splitRule === "percentage") {
      const total = value.splits.reduce((sum, split) => sum + (split.value ?? 0), 0);
      if (total !== 10000) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["splits"], message: "Percentage splits must add up to 100%." });
      }
    }
  });

const createSettlementSchema = z
  .object({
    fromMemberId: z.string().trim().min(1),
    toMemberId: z.string().trim().min(1),
    amount: z.union([z.string(), z.number()]).transform((value, context) => {
      try {
        return parseAmountToMinorUnits(value);
      } catch (error) {
        context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid amount." });
        return z.NEVER;
      }
    }),
    date: z.string().trim().refine(isValidIsoDate),
    note: z.string().trim().max(280).optional()
  })
  .superRefine((value, context) => {
    if (value.fromMemberId === value.toMemberId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["toMemberId"], message: "Settlement participants must be different members." });
    }
  });

const reminderPreferencesSchema = z.object({
  dailyLoggingEnabled: z.boolean(),
  dailyLoggingHour: z.number().int().min(0).max(23),
  budgetAlertsEnabled: z.boolean(),
  budgetAlertThreshold: z.number().int().min(1).max(100)
});

const createBillReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  amount: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return null;
    }

    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid amount." });
      return z.NEVER;
    }
  }),
  category: z.string().trim().max(64).optional(),
  dueDate: z.string().trim().refine(isValidIsoDate),
  recurrence: z.enum(["once", "weekly", "monthly", "yearly"]),
  intervalCount: z.number().int().min(1).max(24),
  reminderDaysBefore: z.number().int().min(0).max(60),
  isActive: z.boolean().default(true)
});

function asIsoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function asIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapWallet(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    default_split_rule: row.default_split_rule,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function mapWalletMember(row) {
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

function mapBillReminder(row) {
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

function mapNotification(row) {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    status: row.notification_status,
    created_at: asIsoTimestamp(row.created_at),
    scheduled_for: row.scheduled_for ? asIsoTimestamp(row.scheduled_for) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null
  };
}

function readFirebaseAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new AuthenticationConfigurationError();
  }

  return { projectId, clientEmail, privateKey };
}

function getFirebaseAuth() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(readFirebaseAdminCredentials())
    });
  }

  return getAuth();
}

async function authenticateRequest(request) {
  const headerValue = request.headers.authorization;
  const token = headerValue && headerValue.startsWith("Bearer ") ? headerValue.slice(7).trim() : "";

  if (!token) {
    throw new AuthenticationError();
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    return {
      id: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null
    };
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) {
      throw error;
    }

    throw new AuthenticationError("Your login session is invalid or expired.");
  }
}

function getSqlClient() {
  if (sqlClient) {
    return sqlClient;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  sqlClient = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  });

  return sqlClient;
}

async function safeSchemaStep(stepName, action) {
  try {
    await action();
  } catch (error) {
    console.error(`Schema step failed: ${stepName}`, error);
  }
}

async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS expenses (id UUID PRIMARY KEY, user_id TEXT, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), category VARCHAR(64) NOT NULL, description VARCHAR(280) NOT NULL, expense_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT`;
      await sql`UPDATE expenses SET user_id = 'legacy-anonymous' WHERE user_id IS NULL`;
      await sql`CREATE TABLE IF NOT EXISTS budgets (id UUID PRIMARY KEY, user_id TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')), category VARCHAR(64), budget_month CHAR(7) NOT NULL, created_at TIMESTAMPTZ NOT NULL, CHECK ((budget_scope = 'monthly' AND category IS NULL) OR (budget_scope = 'category' AND category IS NOT NULL)))`;
      await sql`CREATE TABLE IF NOT EXISTS wallets (id UUID PRIMARY KEY, owner_user_id TEXT NOT NULL, name VARCHAR(120) NOT NULL, description VARCHAR(280), default_split_rule VARCHAR(16) NOT NULL CHECK (default_split_rule IN ('equal', 'fixed', 'percentage')), created_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS wallet_budgets (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')), category VARCHAR(64), budget_month CHAR(7) NOT NULL, created_at TIMESTAMPTZ NOT NULL, CHECK ((budget_scope = 'monthly' AND category IS NULL) OR (budget_scope = 'category' AND category IS NOT NULL)))`;
      await sql`CREATE TABLE IF NOT EXISTS wallet_members (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, user_id TEXT, display_name VARCHAR(120) NOT NULL, email VARCHAR(160), member_role VARCHAR(16) NOT NULL CHECK (member_role IN ('owner', 'member')), invite_status VARCHAR(16) NOT NULL DEFAULT 'linked' CHECK (invite_status IN ('linked', 'pending', 'declined')), joined_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS wallet_expenses (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, paid_by_member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), category VARCHAR(64) NOT NULL, description VARCHAR(280) NOT NULL, expense_date DATE NOT NULL, split_rule VARCHAR(16) NOT NULL CHECK (split_rule IN ('equal', 'fixed', 'percentage')), created_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS wallet_expense_splits (wallet_expense_id UUID NOT NULL REFERENCES wallet_expenses(id) ON DELETE CASCADE, member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0), percentage_basis_points INTEGER, PRIMARY KEY (wallet_expense_id, member_id))`;
      await sql`CREATE TABLE IF NOT EXISTS wallet_settlements (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, from_member_id UUID NOT NULL REFERENCES wallet_members(id), to_member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), settlement_date DATE NOT NULL, note VARCHAR(280), created_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY, user_id TEXT NOT NULL, notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN ('budget-threshold', 'budget-overspent', 'daily-log', 'bill-due', 'wallet-invite')), title VARCHAR(120) NOT NULL, message VARCHAR(280) NOT NULL, notification_status VARCHAR(16) NOT NULL CHECK (notification_status IN ('unread', 'read')), scheduled_for TIMESTAMPTZ, metadata_json TEXT, dedupe_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE (user_id, dedupe_key))`;
      await sql`CREATE TABLE IF NOT EXISTS reminder_preferences (user_id TEXT PRIMARY KEY, daily_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE, daily_logging_hour INTEGER NOT NULL DEFAULT 20 CHECK (daily_logging_hour BETWEEN 0 AND 23), budget_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE, budget_alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (budget_alert_threshold BETWEEN 1 AND 100), updated_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS bill_reminders (id UUID PRIMARY KEY, user_id TEXT NOT NULL, title VARCHAR(120) NOT NULL, amount_minor BIGINT, category VARCHAR(64), due_date DATE NOT NULL, recurrence VARCHAR(16) NOT NULL CHECK (recurrence IN ('once', 'weekly', 'monthly', 'yearly')), interval_count INTEGER NOT NULL CHECK (interval_count BETWEEN 1 AND 24), reminder_days_before INTEGER NOT NULL CHECK (reminder_days_before BETWEEN 0 AND 60), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL)`;
      await safeSchemaStep("wallets description column", () => sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS description VARCHAR(280)`);
      await safeSchemaStep("wallets split rule column", () => sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS default_split_rule VARCHAR(16)`);
      await safeSchemaStep("wallets created at column", () => sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
      await safeSchemaStep("wallets split rule backfill", () => sql`UPDATE wallets SET default_split_rule = 'equal' WHERE default_split_rule IS NULL`);
      await safeSchemaStep("wallets created at backfill", () => sql`UPDATE wallets SET created_at = NOW() WHERE created_at IS NULL`);

      await safeSchemaStep("wallet members email column", () => sql`ALTER TABLE wallet_members ADD COLUMN IF NOT EXISTS email VARCHAR(160)`);
      await safeSchemaStep("wallet members role column", () => sql`ALTER TABLE wallet_members ADD COLUMN IF NOT EXISTS member_role VARCHAR(16)`);
      await safeSchemaStep("wallet members invite status column", () => sql`ALTER TABLE wallet_members ADD COLUMN IF NOT EXISTS invite_status VARCHAR(16)`);
      await safeSchemaStep("wallet members joined at column", () => sql`ALTER TABLE wallet_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ`);
      await safeSchemaStep("wallet members role backfill", () => sql`UPDATE wallet_members SET member_role = 'member' WHERE member_role IS NULL`);
      await safeSchemaStep("wallet members invite status backfill", () => sql`UPDATE wallet_members SET invite_status = 'linked' WHERE invite_status IS NULL OR invite_status NOT IN ('linked', 'pending', 'declined')`);
      await safeSchemaStep("wallet members joined at backfill", () => sql`UPDATE wallet_members SET joined_at = NOW() WHERE joined_at IS NULL`);

      await safeSchemaStep("notifications scheduled for column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`);
      await safeSchemaStep("notifications metadata column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata_json TEXT`);
      await safeSchemaStep("notifications dedupe key column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT`);
      await safeSchemaStep("notifications title column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(120)`);
      await safeSchemaStep("notifications message column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message VARCHAR(280)`);
      await safeSchemaStep("notifications status column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_status VARCHAR(16)`);
      await safeSchemaStep("notifications created at column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
      await safeSchemaStep("notifications type backfill", () => sql`UPDATE notifications SET notification_type = 'daily-log' WHERE notification_type IS NULL`);
      await safeSchemaStep("notifications title backfill", () => sql`UPDATE notifications SET title = COALESCE(title, 'Notification') WHERE title IS NULL`);
      await safeSchemaStep("notifications message backfill", () => sql`UPDATE notifications SET message = COALESCE(message, '') WHERE message IS NULL`);
      await safeSchemaStep("notifications status backfill", () => sql`UPDATE notifications SET notification_status = 'unread' WHERE notification_status IS NULL`);
      await safeSchemaStep("notifications created at backfill", () => sql`UPDATE notifications SET created_at = NOW() WHERE created_at IS NULL`);
      await safeSchemaStep("notifications dedupe key backfill", () => sql`UPDATE notifications SET dedupe_key = CONCAT('legacy:', id::text) WHERE dedupe_key IS NULL OR dedupe_key = ''`);
      await safeSchemaStep(
        "notifications dedupe cleanup",
        () => sql`
          DELETE FROM notifications
          WHERE id IN (
            SELECT id
            FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, dedupe_key ORDER BY created_at DESC, id DESC) AS row_number
              FROM notifications
            ) ranked_notifications
            WHERE ranked_notifications.row_number > 1
          )
        `
      );
      await safeSchemaStep("notifications dedupe index", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_id_dedupe_key_idx ON notifications (user_id, dedupe_key)`);

      await safeSchemaStep("reminder preferences daily enabled column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS daily_logging_enabled BOOLEAN`);
      await safeSchemaStep("reminder preferences daily hour column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS daily_logging_hour INTEGER`);
      await safeSchemaStep("reminder preferences budget enabled column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS budget_alerts_enabled BOOLEAN`);
      await safeSchemaStep("reminder preferences threshold column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS budget_alert_threshold INTEGER`);
      await safeSchemaStep("reminder preferences updated at column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
      await safeSchemaStep("reminder preferences backfill enabled", () => sql`UPDATE reminder_preferences SET daily_logging_enabled = TRUE WHERE daily_logging_enabled IS NULL`);
      await safeSchemaStep("reminder preferences backfill hour", () => sql`UPDATE reminder_preferences SET daily_logging_hour = 20 WHERE daily_logging_hour IS NULL`);
      await safeSchemaStep("reminder preferences backfill budget enabled", () => sql`UPDATE reminder_preferences SET budget_alerts_enabled = TRUE WHERE budget_alerts_enabled IS NULL`);
      await safeSchemaStep("reminder preferences backfill threshold", () => sql`UPDATE reminder_preferences SET budget_alert_threshold = 80 WHERE budget_alert_threshold IS NULL`);
      await safeSchemaStep("reminder preferences backfill updated", () => sql`UPDATE reminder_preferences SET updated_at = NOW() WHERE updated_at IS NULL`);

      await safeSchemaStep("bill reminders amount column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS amount_minor BIGINT`);
      await safeSchemaStep("bill reminders category column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS category VARCHAR(64)`);
      await safeSchemaStep("bill reminders recurrence column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS recurrence VARCHAR(16)`);
      await safeSchemaStep("bill reminders interval column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS interval_count INTEGER`);
      await safeSchemaStep("bill reminders days before column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER`);
      await safeSchemaStep("bill reminders active column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS is_active BOOLEAN`);
      await safeSchemaStep("bill reminders created at column", () => sql`ALTER TABLE bill_reminders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
      await safeSchemaStep("bill reminders recurrence backfill", () => sql`UPDATE bill_reminders SET recurrence = 'monthly' WHERE recurrence IS NULL`);
      await safeSchemaStep("bill reminders interval backfill", () => sql`UPDATE bill_reminders SET interval_count = 1 WHERE interval_count IS NULL`);
      await safeSchemaStep("bill reminders reminder days backfill", () => sql`UPDATE bill_reminders SET reminder_days_before = 3 WHERE reminder_days_before IS NULL`);
      await safeSchemaStep("bill reminders active backfill", () => sql`UPDATE bill_reminders SET is_active = TRUE WHERE is_active IS NULL`);
      await safeSchemaStep("bill reminders created at backfill", () => sql`UPDATE bill_reminders SET created_at = NOW() WHERE created_at IS NULL`);

      await safeSchemaStep("wallet budget index", () => sql`CREATE INDEX IF NOT EXISTS wallet_budgets_wallet_id_budget_month_idx ON wallet_budgets (wallet_id, budget_month DESC, created_at DESC)`);
      await safeSchemaStep("bill reminders index", () => sql`CREATE INDEX IF NOT EXISTS bill_reminders_user_id_due_date_idx ON bill_reminders (user_id, due_date ASC, created_at ASC)`);
    })();
  }

  await schemaReady;
}

async function ensureWalletAccess(sql, userId, walletId) {
  const rows = await sql`SELECT wallets.id FROM wallets INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id WHERE wallets.id = ${walletId} AND wallet_members.user_id = ${userId} LIMIT 1`;
  if (!rows[0]) {
    throw new Error("Wallet not found.");
  }
}

function buildEqualSplits(totalAmount, memberIds) {
  const baseShare = Math.floor(totalAmount / memberIds.length);
  let remainder = totalAmount - baseShare * memberIds.length;
  return memberIds.map((memberId) => {
    const amountMinor = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return { memberId, amountMinor, percentageBasisPoints: null };
  });
}

function buildPercentageSplits(totalAmount, splits) {
  const allocations = splits.map((split) => {
    const multiplied = totalAmount * (split.value ?? 0);
    return { memberId: split.memberId, amountMinor: Math.floor(multiplied / 10000), remainder: multiplied % 10000, percentageBasisPoints: split.value ?? 0 };
  });
  const remainingMinorUnits = totalAmount - allocations.reduce((sum, split) => sum + split.amountMinor, 0);
  allocations.sort((left, right) => right.remainder - left.remainder).slice(0, remainingMinorUnits).forEach((split) => {
    split.amountMinor += 1;
  });
  return allocations.map((split) => ({ memberId: split.memberId, amountMinor: split.amountMinor, percentageBasisPoints: split.percentageBasisPoints }));
}

async function loadWalletDetail(sql, walletId) {
  const walletRows = await sql`SELECT id, name, description, default_split_rule, created_at FROM wallets WHERE id = ${walletId}`;
  if (!walletRows[0]) {
    throw new Error("Wallet not found.");
  }
  const walletBudgetRows = await sql`SELECT id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at FROM wallet_budgets WHERE wallet_id = ${walletId} ORDER BY budget_month DESC, created_at DESC`;
  const members = await sql`SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at FROM wallet_members WHERE wallet_id = ${walletId} ORDER BY joined_at ASC`;
  const expenseRows = await sql`
    SELECT wallet_expenses.id, wallet_expenses.wallet_id, wallet_expenses.paid_by_member_id, payer.display_name AS paid_by_member_name, wallet_expenses.amount_minor, wallet_expenses.category, wallet_expenses.description, wallet_expenses.expense_date, wallet_expenses.split_rule, wallet_expenses.created_at
    FROM wallet_expenses
    INNER JOIN wallet_members AS payer ON payer.id = wallet_expenses.paid_by_member_id
    WHERE wallet_expenses.wallet_id = ${walletId}
    ORDER BY wallet_expenses.expense_date DESC, wallet_expenses.created_at DESC
  `;
  const splitRows = await sql`
    SELECT wallet_expense_splits.wallet_expense_id, wallet_expense_splits.member_id, wallet_members.display_name AS member_name, wallet_expense_splits.amount_minor, wallet_expense_splits.percentage_basis_points
    FROM wallet_expense_splits
    INNER JOIN wallet_members ON wallet_members.id = wallet_expense_splits.member_id
    INNER JOIN wallet_expenses ON wallet_expenses.id = wallet_expense_splits.wallet_expense_id
    WHERE wallet_expenses.wallet_id = ${walletId}
  `;
  const settlementRows = await sql`
    SELECT wallet_settlements.id, wallet_settlements.wallet_id, wallet_settlements.from_member_id, from_member.display_name AS from_member_name, wallet_settlements.to_member_id, to_member.display_name AS to_member_name, wallet_settlements.amount_minor, wallet_settlements.settlement_date, wallet_settlements.note, wallet_settlements.created_at
    FROM wallet_settlements
    INNER JOIN wallet_members AS from_member ON from_member.id = wallet_settlements.from_member_id
    INNER JOIN wallet_members AS to_member ON to_member.id = wallet_settlements.to_member_id
    WHERE wallet_settlements.wallet_id = ${walletId}
    ORDER BY wallet_settlements.settlement_date DESC, wallet_settlements.created_at DESC
  `;

  const splitMap = new Map();
  for (const split of splitRows) {
    const list = splitMap.get(split.wallet_expense_id) ?? [];
    list.push({ member_id: split.member_id, member_name: split.member_name, amount: formatMinorUnits(Number(split.amount_minor)), percentage: split.percentage_basis_points === null ? null : split.percentage_basis_points / 100 });
    splitMap.set(split.wallet_expense_id, list);
  }

  const balances = new Map(members.map((member) => [member.id, 0]));
  for (const expense of expenseRows) {
    balances.set(expense.paid_by_member_id, (balances.get(expense.paid_by_member_id) ?? 0) + Number(expense.amount_minor));
  }
  for (const split of splitRows) {
    balances.set(split.member_id, (balances.get(split.member_id) ?? 0) - Number(split.amount_minor));
  }
  for (const settlement of settlementRows) {
    balances.set(settlement.from_member_id, (balances.get(settlement.from_member_id) ?? 0) + Number(settlement.amount_minor));
    balances.set(settlement.to_member_id, (balances.get(settlement.to_member_id) ?? 0) - Number(settlement.amount_minor));
  }

  return {
    wallet: mapWallet(walletRows[0]),
    members: members.map(mapWalletMember),
    budgets: walletBudgetRows.map((budget) => ({ id: budget.id, wallet_id: budget.wallet_id, amount: formatMinorUnits(Number(budget.amount_minor)), scope: budget.budget_scope, category: budget.category, month: budget.budget_month, created_at: asIsoTimestamp(budget.created_at) })),
    expenses: expenseRows.map((expense) => ({ id: expense.id, wallet_id: expense.wallet_id, paid_by_member_id: expense.paid_by_member_id, paid_by_member_name: expense.paid_by_member_name, amount: formatMinorUnits(Number(expense.amount_minor)), category: expense.category, description: expense.description, date: asIsoDate(expense.expense_date), split_rule: expense.split_rule, created_at: asIsoTimestamp(expense.created_at), splits: splitMap.get(expense.id) ?? [] })),
    balances: members.map((member) => ({ member_id: member.id, member_name: member.display_name, net_amount: formatMinorUnits(balances.get(member.id) ?? 0) })).sort((left, right) => Number(right.net_amount) - Number(left.net_amount)),
    settlements: settlementRows.map((settlement) => ({ id: settlement.id, wallet_id: settlement.wallet_id, from_member_id: settlement.from_member_id, from_member_name: settlement.from_member_name, to_member_id: settlement.to_member_id, to_member_name: settlement.to_member_name, amount: formatMinorUnits(Number(settlement.amount_minor)), date: asIsoDate(settlement.settlement_date), note: settlement.note, created_at: asIsoTimestamp(settlement.created_at) }))
  };
}

async function listWalletsForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT wallets.id, wallets.name, wallets.description, wallets.default_split_rule, wallets.created_at FROM wallets INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id WHERE wallet_members.user_id = ${userId} ORDER BY wallets.created_at DESC`;
  return rows.map(mapWallet);
}

async function createWalletForUser(user, rawBody) {
  const result = createWalletSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletId = randomUUID();
    const createdAt = new Date().toISOString();
    await tx`INSERT INTO wallets (id, owner_user_id, name, description, default_split_rule, created_at) VALUES (${walletId}, ${user.id}, ${result.data.name.trim()}, ${result.data.description?.trim() || null}, ${result.data.defaultSplitRule}, ${createdAt})`;
    const ownerName = user.name?.trim() || user.email?.trim() || "You";
    await tx`INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at) VALUES (${randomUUID()}, ${walletId}, ${user.id}, ${ownerName}, ${user.email?.trim() || null}, ${"owner"}, ${"linked"}, ${createdAt})`;
    for (const member of result.data.members) {
      if (member.displayName.trim().toLowerCase() === ownerName.toLowerCase()) {
        continue;
      }
      await tx`INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at) VALUES (${randomUUID()}, ${walletId}, ${null}, ${member.displayName.trim()}, ${member.email?.trim().toLowerCase() || null}, ${"member"}, ${member.email?.trim() ? "pending" : "linked"}, ${createdAt})`;
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 201, body: { wallet } };
}

async function getWalletForUser(userId, walletId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);
  return { status: 200, body: { wallet: await loadWalletDetail(sql, walletId) } };
}

async function deleteWalletForUser(userId, walletId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const result = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const wallet = walletRows[0];

    if (!wallet) {
      return { status: 404, body: { error: "Wallet not found." } };
    }

    await ensureWalletAccess(tx, userId, walletId);

    if (wallet.owner_user_id !== userId) {
      return { status: 400, body: { error: "Only the wallet owner can delete this group." } };
    }

    await tx`
      DELETE FROM notifications
      WHERE metadata_json IS NOT NULL
        AND metadata_json::jsonb ->> 'walletId' = ${walletId}
    `;

    await tx`DELETE FROM wallets WHERE id = ${walletId}`;
    return { status: 204, body: null };
  });

  return result;
}

async function leaveWalletForUser(userId, walletId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const result = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);

    const membershipRows = await tx`
      SELECT id, member_role
      FROM wallet_members
      WHERE wallet_id = ${walletId} AND user_id = ${userId}
      LIMIT 1
    `;

    const membership = membershipRows[0];

    if (!membership) {
      return { status: 404, body: { error: "Wallet not found." } };
    }

    if (membership.member_role === "owner") {
      return { status: 400, body: { error: "The wallet owner can delete the group instead of exiting it." } };
    }

    const historyRows = await tx`
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

    return { status: 204, body: null };
  });

  return result;
}

async function createWalletBudgetForUser(userId, walletId, rawBody) {
  const result = createBudgetSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet budget payload.", details: result.error.flatten() } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);
  await sql`INSERT INTO wallet_budgets (id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at) VALUES (${randomUUID()}, ${walletId}, ${result.data.amount}, ${result.data.scope}, ${result.data.scope === "category" ? result.data.category?.trim() ?? null : null}, ${result.data.month}, ${new Date().toISOString()})`;
  return { status: 201, body: { wallet: await loadWalletDetail(sql, walletId) } };
}

async function updateWalletBudgetForUser(userId, walletId, walletBudgetId, rawBody) {
  const result = createBudgetSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet budget payload.", details: result.error.flatten() } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);
  const rows = await sql`UPDATE wallet_budgets SET amount_minor = ${result.data.amount}, budget_scope = ${result.data.scope}, category = ${result.data.scope === "category" ? result.data.category?.trim() ?? null : null}, budget_month = ${result.data.month} WHERE id = ${walletBudgetId} AND wallet_id = ${walletId} RETURNING id`;

  if (!rows[0]) {
    return { status: 404, body: { error: "Wallet budget not found." } };
  }

  return { status: 200, body: { wallet: await loadWalletDetail(sql, walletId) } };
}

async function deleteWalletBudgetForUser(userId, walletId, walletBudgetId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);
  const rows = await sql`DELETE FROM wallet_budgets WHERE id = ${walletBudgetId} AND wallet_id = ${walletId} RETURNING id`;

  if (!rows[0]) {
    return { status: 404, body: { error: "Wallet budget not found." } };
  }

  return { status: 200, body: { wallet: await loadWalletDetail(sql, walletId) } };
}

async function linkWalletInvitesForUser(user) {
  const normalizedEmail = user.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return { status: 200, body: { linkedCount: 0 } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);
  const pendingInvites = await sql`
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
      userId: user.id,
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

  return { status: 200, body: { linkedCount } };
}

async function respondToWalletInvite(user, walletMemberId, rawBody) {
  const result = walletInviteResponseSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet invite response payload.", details: result.error.flatten() } };
  }

  const normalizedEmail = user.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: 404, body: { error: "Wallet invite not found." } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  try {
    await sql.begin(async (tx) => {
      const inviteRows = await tx`
        SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at
        FROM wallet_members
        WHERE id = ${walletMemberId}
          AND user_id IS NULL
          AND invite_status = ${"pending"}
          AND lower(email) = ${normalizedEmail}
      `;

      const invite = inviteRows[0];

      if (!invite) {
        throw new Error("Wallet invite not found.");
      }

      if (result.data.action === "accept") {
        await tx`
          UPDATE wallet_members
          SET user_id = ${user.id},
              invite_status = ${"linked"},
              display_name = COALESCE(${user.name?.trim() || null}, display_name)
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
        WHERE user_id = ${user.id}
          AND notification_type = ${"wallet-invite"}
          AND metadata_json IS NOT NULL
          AND metadata_json::jsonb ->> 'walletMemberId' = ${walletMemberId}
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Wallet invite not found.") {
      return { status: 404, body: { error: error.message } };
    }

    throw error;
  }

  return { status: 200, body: { success: true } };
}

async function createWalletMemberForUser(userId, walletId, rawBody) {
  const result = createWalletMemberSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet member payload.", details: result.error.flatten() } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    if (!walletRows[0]) {
      throw new Error("Wallet not found.");
    }

    await ensureWalletAccess(tx, userId, walletId);
    if (walletRows[0].owner_user_id !== userId) {
      throw new Error("Only the wallet owner can invite members.");
    }

    const normalizedName = result.data.displayName.trim();
    const normalizedEmail = result.data.email?.trim().toLowerCase() || null;
    const existingRows = normalizedEmail
      ? await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId} AND lower(email) = ${normalizedEmail}`
      : await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId} AND lower(display_name) = ${normalizedName.toLowerCase()}`;

    if (existingRows[0]) {
      throw new Error("That member is already part of this wallet.");
    }

    await tx`
      INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at)
      VALUES (${randomUUID()}, ${walletId}, ${null}, ${normalizedName}, ${normalizedEmail}, ${"member"}, ${normalizedEmail ? "pending" : "linked"}, ${new Date().toISOString()})
    `;

    return loadWalletDetail(tx, walletId);
  });

  return { status: 201, body: { wallet } };
}

async function createWalletExpenseForUser(userId, walletId, rawBody) {
  const result = createWalletExpenseSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet expense payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const memberRows = await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId}`;
    const memberIds = new Set(memberRows.map((row) => row.id));
    if (!memberIds.has(result.data.paidByMemberId) || result.data.splits.some((split) => !memberIds.has(split.memberId))) {
      throw new Error("One or more members do not belong to this wallet.");
    }
    const expenseId = randomUUID();
    await tx`INSERT INTO wallet_expenses (id, wallet_id, paid_by_member_id, amount_minor, category, description, expense_date, split_rule, created_at) VALUES (${expenseId}, ${walletId}, ${result.data.paidByMemberId}, ${result.data.amount}, ${result.data.category.trim()}, ${result.data.description.trim()}, ${result.data.date}, ${result.data.splitRule}, ${new Date().toISOString()})`;
    const splits = result.data.splitRule === "equal" ? buildEqualSplits(result.data.amount, result.data.splits.map((split) => split.memberId)) : result.data.splitRule === "fixed" ? result.data.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null })) : buildPercentageSplits(result.data.amount, result.data.splits);
    for (const split of splits) {
      await tx`INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points) VALUES (${expenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})`;
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 201, body: { wallet } };
}

async function updateWalletExpenseForUser(userId, walletId, walletExpenseId, rawBody) {
  const result = createWalletExpenseSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet expense payload.", details: result.error.flatten() } };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const expenseRows = await tx`SELECT id FROM wallet_expenses WHERE id = ${walletExpenseId} AND wallet_id = ${walletId}`;
    if (!expenseRows[0]) {
      throw new Error("Shared expense not found.");
    }
    const memberRows = await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId}`;
    const memberIds = new Set(memberRows.map((row) => row.id));
    if (!memberIds.has(result.data.paidByMemberId) || result.data.splits.some((split) => !memberIds.has(split.memberId))) {
      throw new Error("One or more wallet members are invalid for this shared expense.");
    }
    await tx`
      UPDATE wallet_expenses
      SET paid_by_member_id = ${result.data.paidByMemberId}, amount_minor = ${result.data.amount}, category = ${result.data.category.trim()}, description = ${result.data.description.trim()}, expense_date = ${result.data.date}, split_rule = ${result.data.splitRule}
      WHERE id = ${walletExpenseId} AND wallet_id = ${walletId}
    `;
    await tx`DELETE FROM wallet_expense_splits WHERE wallet_expense_id = ${walletExpenseId}`;
    const splits = result.data.splitRule === "equal" ? buildEqualSplits(result.data.amount, result.data.splits.map((split) => split.memberId)) : result.data.splitRule === "fixed" ? result.data.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null })) : buildPercentageSplits(result.data.amount, result.data.splits);
    for (const split of splits) {
      await tx`INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points) VALUES (${walletExpenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})`;
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function deleteWalletExpenseForUser(userId, walletId, walletExpenseId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const rows = await tx`DELETE FROM wallet_expenses WHERE id = ${walletExpenseId} AND wallet_id = ${walletId} RETURNING id`;
    if (!rows[0]) {
      throw new Error("Shared expense not found.");
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function createWalletSettlementForUser(userId, walletId, rawBody) {
  const result = createSettlementSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid settlement payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    await tx`INSERT INTO wallet_settlements (id, wallet_id, from_member_id, to_member_id, amount_minor, settlement_date, note, created_at) VALUES (${randomUUID()}, ${walletId}, ${result.data.fromMemberId}, ${result.data.toMemberId}, ${result.data.amount}, ${result.data.date}, ${result.data.note?.trim() || null}, ${new Date().toISOString()})`;
    return loadWalletDetail(tx, walletId);
  });
  return { status: 201, body: { wallet } };
}

async function updateWalletSettlementForUser(userId, walletId, settlementId, rawBody) {
  const result = createSettlementSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid settlement payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const rows = await tx`SELECT id FROM wallet_settlements WHERE id = ${settlementId} AND wallet_id = ${walletId}`;
    if (!rows[0]) {
      throw new Error("Settlement not found.");
    }
    await tx`
      UPDATE wallet_settlements
      SET from_member_id = ${result.data.fromMemberId}, to_member_id = ${result.data.toMemberId}, amount_minor = ${result.data.amount}, settlement_date = ${result.data.date}, note = ${result.data.note?.trim() || null}
      WHERE id = ${settlementId} AND wallet_id = ${walletId}
    `;
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function deleteWalletSettlementForUser(userId, walletId, settlementId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const rows = await tx`DELETE FROM wallet_settlements WHERE id = ${settlementId} AND wallet_id = ${walletId} RETURNING id`;
    if (!rows[0]) {
      throw new Error("Settlement not found.");
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function listBillRemindersForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at FROM bill_reminders WHERE user_id = ${userId} ORDER BY due_date ASC, created_at ASC`;
  return { status: 200, body: { billReminders: rows.map(mapBillReminder) } };
}

async function createBillReminderForUser(userId, rawBody) {
  const result = createBillReminderSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid bill reminder payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`
    INSERT INTO bill_reminders (id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at)
    VALUES (${randomUUID()}, ${userId}, ${result.data.title.trim()}, ${result.data.amount}, ${result.data.category?.trim() || null}, ${result.data.dueDate}, ${result.data.recurrence}, ${result.data.intervalCount}, ${result.data.reminderDaysBefore}, ${result.data.isActive}, ${new Date().toISOString()})
    RETURNING id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at
  `;
  return { status: 201, body: { billReminder: mapBillReminder(rows[0]) } };
}

async function updateBillReminderForUser(userId, billReminderId, rawBody) {
  const result = createBillReminderSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid bill reminder payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`
    UPDATE bill_reminders
    SET title = ${result.data.title.trim()}, amount_minor = ${result.data.amount}, category = ${result.data.category?.trim() || null}, due_date = ${result.data.dueDate}, recurrence = ${result.data.recurrence}, interval_count = ${result.data.intervalCount}, reminder_days_before = ${result.data.reminderDaysBefore}, is_active = ${result.data.isActive}
    WHERE id = ${billReminderId} AND user_id = ${userId}
    RETURNING id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at
  `;
  if (!rows[0]) {
    return { status: 404, body: { error: "Bill reminder not found." } };
  }
  return { status: 200, body: { billReminder: mapBillReminder(rows[0]) } };
}

async function deleteBillReminderForUser(userId, billReminderId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`DELETE FROM bill_reminders WHERE id = ${billReminderId} AND user_id = ${userId} RETURNING id`;
  if (!rows[0]) {
    return { status: 404, body: { error: "Bill reminder not found." } };
  }
  return { status: 204, body: null };
}

async function listNotificationsForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return { status: 200, body: { notifications: rows.map(mapNotification) } };
}

async function markNotificationReadForUser(userId, notificationId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`UPDATE notifications SET notification_status = ${"read"} WHERE id = ${notificationId} AND user_id = ${userId} RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key`;
  if (!rows[0]) {
    return { status: 404, body: { error: "Notification not found." } };
  }
  return { status: 200, body: { notification: mapNotification(rows[0]) } };
}

async function deleteNotificationForUser(userId, notificationId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`DELETE FROM notifications WHERE id = ${notificationId} AND user_id = ${userId} RETURNING id`;
  if (!rows[0]) {
    return { status: 404, body: { error: "Notification not found." } };
  }
  return { status: 204, body: null };
}

async function markAllNotificationsReadForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await sql`UPDATE notifications SET notification_status = ${"read"} WHERE user_id = ${userId}`;
  return { status: 204, body: null };
}

async function getReminderPreferencesForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at FROM reminder_preferences WHERE user_id = ${userId}`;
  if (!rows[0]) {
    return { status: 200, body: { preferences: { daily_logging_enabled: true, daily_logging_hour: 20, budget_alerts_enabled: true, budget_alert_threshold: 80, updated_at: new Date().toISOString() } } };
  }
  const row = rows[0];
  return { status: 200, body: { preferences: { daily_logging_enabled: row.daily_logging_enabled, daily_logging_hour: row.daily_logging_hour, budget_alerts_enabled: row.budget_alerts_enabled, budget_alert_threshold: row.budget_alert_threshold, updated_at: asIsoTimestamp(row.updated_at) } } };
}

async function updateReminderPreferencesForUser(userId, rawBody) {
  const result = reminderPreferencesSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid reminder preferences payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`INSERT INTO reminder_preferences (user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at) VALUES (${userId}, ${result.data.dailyLoggingEnabled}, ${result.data.dailyLoggingHour}, ${result.data.budgetAlertsEnabled}, ${result.data.budgetAlertThreshold}, ${new Date().toISOString()}) ON CONFLICT (user_id) DO UPDATE SET daily_logging_enabled = EXCLUDED.daily_logging_enabled, daily_logging_hour = EXCLUDED.daily_logging_hour, budget_alerts_enabled = EXCLUDED.budget_alerts_enabled, budget_alert_threshold = EXCLUDED.budget_alert_threshold, updated_at = EXCLUDED.updated_at RETURNING user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at`;
  const row = rows[0];
  return { status: 200, body: { preferences: { daily_logging_enabled: row.daily_logging_enabled, daily_logging_hour: row.daily_logging_hour, budget_alerts_enabled: row.budget_alerts_enabled, budget_alert_threshold: row.budget_alert_threshold, updated_at: asIsoTimestamp(row.updated_at) } } };
}

async function upsertNotification(sql, input) {
  const rows = await sql`INSERT INTO notifications (id, user_id, notification_type, title, message, notification_status, scheduled_for, metadata_json, dedupe_key, created_at) VALUES (${randomUUID()}, ${input.userId}, ${input.type}, ${input.title}, ${input.message}, ${"unread"}, ${input.scheduledFor}, ${input.metadata ? JSON.stringify(input.metadata) : null}, ${input.dedupeKey}, ${new Date().toISOString()}) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key`;
  return rows[0] ? mapNotification(rows[0]) : null;
}

function getTodayIsoDate(baseDate = new Date()) {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

function getCurrentMonth(baseDate = new Date()) {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function addRecurrence(baseDate, recurrence, intervalCount) {
  const nextDate = new Date(baseDate);

  if (recurrence === "weekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + intervalCount * 7);
    return nextDate;
  }

  if (recurrence === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + intervalCount);
    return nextDate;
  }

  if (recurrence === "yearly") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + intervalCount);
    return nextDate;
  }

  return nextDate;
}

function getUpcomingBillDueDate(billReminder, now) {
  if (!billReminder.is_active) {
    return null;
  }

  const today = new Date(`${getTodayIsoDate(now)}T00:00:00.000Z`);
  let dueDate = new Date(`${asIsoDate(billReminder.due_date)}T00:00:00.000Z`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  if (billReminder.recurrence === "once") {
    return dueDate >= today ? asIsoDate(dueDate) : null;
  }

  while (dueDate < today) {
    dueDate = addRecurrence(dueDate, billReminder.recurrence, billReminder.interval_count);
  }

  return asIsoDate(dueDate);
}

async function runReminderChecksForUser(targetUserId) {
  return runReminderChecks(targetUserId);
}

async function runReminderChecks(targetUserId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const now = new Date();
  const users = targetUserId ? [targetUserId] : (await sql`SELECT DISTINCT user_id FROM (SELECT user_id FROM expenses UNION SELECT user_id FROM budgets UNION SELECT user_id FROM bill_reminders UNION SELECT user_id FROM reminder_preferences) AS users WHERE user_id IS NOT NULL`).map((row) => row.user_id);
  const createdNotifications = [];
  const currentDate = getTodayIsoDate(now);
  const currentMonth = getCurrentMonth(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

  for (const userId of users) {
    const preferenceRows = await sql`SELECT user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, updated_at FROM reminder_preferences WHERE user_id = ${userId}`;
    const preferences = preferenceRows[0] ?? { daily_logging_enabled: true, daily_logging_hour: 20, budget_alerts_enabled: true, budget_alert_threshold: 80 };
    if (preferences.daily_logging_enabled && now.getHours() >= preferences.daily_logging_hour) {
      const todayExpenseRows = await sql`SELECT COUNT(*)::text AS count FROM expenses WHERE user_id = ${userId} AND expense_date = ${currentDate}`;
      if (Number(todayExpenseRows[0]?.count ?? "0") === 0) {
        const notification = await upsertNotification(sql, { userId, type: "daily-log", title: "Log today's spending", message: "You have not added any expenses today. Capture them before the day ends.", scheduledFor: `${currentDate}T${String(preferences.daily_logging_hour).padStart(2, "0")}:00:00.000Z`, metadata: { date: currentDate }, dedupeKey: `daily-log:${currentDate}` });
        if (notification) {
          createdNotifications.push(notification);
        }
      }
    }
    if (preferences.budget_alerts_enabled) {
      const budgets = await sql`SELECT id, amount_minor, budget_scope, category, budget_month FROM budgets WHERE user_id = ${userId} AND budget_month = ${currentMonth}`;
      for (const budget of budgets) {
        const spendRows = budget.budget_scope === "category"
          ? await sql`SELECT COALESCE(SUM(amount_minor), 0)::text AS spent_minor FROM expenses WHERE user_id = ${userId} AND expense_date >= ${`${currentMonth}-01`} AND expense_date < ${nextMonthStart} AND category = ${budget.category}`
          : await sql`SELECT COALESCE(SUM(amount_minor), 0)::text AS spent_minor FROM expenses WHERE user_id = ${userId} AND expense_date >= ${`${currentMonth}-01`} AND expense_date < ${nextMonthStart}`;
        const spentMinor = Number(spendRows[0]?.spent_minor ?? "0");
        if (spentMinor <= 0) {
          continue;
        }
        if (spentMinor > Number(budget.amount_minor)) {
          const notification = await upsertNotification(sql, { userId, type: "budget-overspent", title: budget.budget_scope === "category" ? `${budget.category} budget exceeded` : "Monthly budget exceeded", message: `${formatMinorUnits(spentMinor)} spent against a ${formatMinorUnits(Number(budget.amount_minor))} budget for ${budget.budget_month}.`, scheduledFor: null, metadata: { budgetId: budget.id, month: budget.budget_month }, dedupeKey: `budget-overspent:${budget.id}:${budget.budget_month}` });
          if (notification) {
            createdNotifications.push(notification);
          }
        } else if (spentMinor >= Math.ceil((Number(budget.amount_minor) * preferences.budget_alert_threshold) / 100)) {
          const notification = await upsertNotification(sql, { userId, type: "budget-threshold", title: budget.budget_scope === "category" ? `${budget.category} budget nearing limit` : "Monthly budget nearing limit", message: `${formatMinorUnits(spentMinor)} spent, which is ${preferences.budget_alert_threshold}% or more of your ${formatMinorUnits(Number(budget.amount_minor))} budget for ${budget.budget_month}.`, scheduledFor: null, metadata: { budgetId: budget.id, month: budget.budget_month }, dedupeKey: `budget-threshold:${budget.id}:${budget.budget_month}:${preferences.budget_alert_threshold}` });
          if (notification) {
            createdNotifications.push(notification);
          }
        }
      }
    }

    const billReminders = await sql`SELECT id, user_id, title, amount_minor, category, due_date, recurrence, interval_count, reminder_days_before, is_active, created_at FROM bill_reminders WHERE user_id = ${userId}`;
    for (const billReminder of billReminders) {
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
        userId,
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

  return { status: 200, body: { processed_user_count: users.length, created_notifications: createdNotifications } };
}

async function deleteUserData(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await sql.begin(async (tx) => {
    await tx`DELETE FROM notifications WHERE user_id = ${userId}`;
    await tx`DELETE FROM reminder_preferences WHERE user_id = ${userId}`;
    await tx`DELETE FROM bill_reminders WHERE user_id = ${userId}`;
    await tx`DELETE FROM wallets WHERE owner_user_id = ${userId}`;
    await tx`DELETE FROM budgets WHERE user_id = ${userId}`;
    await tx`DELETE FROM expenses WHERE user_id = ${userId}`;
  });
}

module.exports = {
  AuthenticationError,
  AuthenticationConfigurationError,
  authenticateRequest,
  linkWalletInvitesForUser,
  listWalletsForUser,
  createWalletForUser,
  getWalletForUser,
  deleteWalletForUser,
  leaveWalletForUser,
  createWalletBudgetForUser,
  updateWalletBudgetForUser,
  deleteWalletBudgetForUser,
  createWalletMemberForUser,
  respondToWalletInvite,
  createWalletExpenseForUser,
  updateWalletExpenseForUser,
  deleteWalletExpenseForUser,
  createWalletSettlementForUser,
  updateWalletSettlementForUser,
  deleteWalletSettlementForUser,
  listBillRemindersForUser,
  createBillReminderForUser,
  updateBillReminderForUser,
  deleteBillReminderForUser,
  listNotificationsForUser,
  markNotificationReadForUser,
  markAllNotificationsReadForUser,
  deleteNotificationForUser,
  getReminderPreferencesForUser,
  updateReminderPreferencesForUser,
  runReminderChecksForUser,
  runReminderChecks,
  deleteUserData
};