const { randomUUID } = require("node:crypto");
const { saveEmbedding, deleteEmbedding } = require("./embeddings-helper");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getSqlClient } = require("./db");
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
const RUN_SCHEMA_SETUP_ON_REQUEST = process.env.RUN_SCHEMA_SETUP_ON_REQUEST !== "false";
const DEFAULT_WALLET_HISTORY_LIMIT = 50;
const MAX_WALLET_HISTORY_LIMIT = 100;

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

function isValidIsoMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month] = value.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

const createBudgetSchema = z
  .object({
    amount: z.union([z.string(), z.number()]).transform((value, context) => {
      try {
        return parseAmountToMinorUnits(value);
      } catch (error) {
        context.issues.push({
          code: z.ZodIssueCode.custom,
          input: value,
          message: error instanceof Error ? error.message : "Invalid amount."
        });
        return z.NEVER;
      }
    }),
    scope: z.enum(["monthly", "category"]),
    category: z.string().trim().max(64, "Category is too long.").optional(),
    month: z.string().trim().refine(isValidIsoMonth, "Month must be a valid YYYY-MM value.")
  })
  .superRefine((value, context) => {
    if (value.scope === "category" && !value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Category is required for a category budget."
      });
    }

    if (value.scope === "monthly" && value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Monthly budgets cannot target a specific category."
      });
    }
  });

const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).optional(),
  defaultSplitRule: z.enum(["equal", "fixed", "percentage"]).default("equal"),
  currency: z.string().trim().max(10).optional(),
  pictureUrl: z.string().trim().max(1000000).optional().nullable(),
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
    splits: z.array(z.object({ memberId: z.string().trim().min(1), value: z.union([z.string(), z.number()]).optional() })).min(1),
    platform: z.string().trim().max(50, "Platform is too long.").nullable().optional()
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

const createWalletLoanSchema = z.object({
  borrowerMemberId: z.string().trim().min(1, "Borrower member is required.").optional(),
  borrowerName: z.string().trim().min(1, "Borrower name is required.").max(120).optional(),
  borrowerEmail: z.string().trim().email("Invalid borrower email.").max(320).nullable().optional(),
  walletId: z.string().trim().min(1).nullable().optional(),
  amount: z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid loan amount." });
      return z.NEVER;
    }
  }),
  interestRate: z.union([z.string(), z.number()]).default(0).transform((value, context) => {
    const raw = typeof value === "number" ? value.toString() : String(value ?? "0").trim();
    if (raw === "" || raw === "0") return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: "Interest rate must be a valid number with up to 2 decimal places." });
      return z.NEVER;
    }
    const basisPoints = Math.round(Number(raw) * 100);
    if (basisPoints < 0 || basisPoints > 100000) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: "Interest rate must be between 0% and 1000%." });
      return z.NEVER;
    }
    return basisPoints;
  }),
  interestType: z.enum(["percentage", "fixed", "none"]).default("percentage"),
  interestRatePeriod: z.enum(["monthly", "yearly", "one-time"]).default("monthly"),
  loanType: z.enum(["lent", "borrowed"]).default("lent"),
  lendingDate: z.string().trim().refine(isValidIsoDate, "Lending date must be a valid YYYY-MM-DD value."),
  dueDate: z.string().trim().refine(isValidIsoDate, "Due date must be a valid YYYY-MM-DD value.").nullable().optional(),
  interestStartDate: z.string().trim().refine(isValidIsoDate, "Interest start date must be a valid YYYY-MM-DD value.").nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional(),
  creatorName: z.string().trim().max(120).optional(),
  creatorEmail: z.string().trim().email("Invalid creator email.").max(320).nullable().optional()
});

const updateWalletLoanSchema = z.object({
  borrowerMemberId: z.string().trim().min(1).optional(),
  borrowerName: z.string().trim().min(1).max(120).optional(),
  borrowerEmail: z.string().trim().email("Invalid borrower email.").max(320).nullable().optional(),
  amount: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid loan amount." });
      return z.NEVER;
    }
  }),
  interestRate: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    const raw = typeof value === "number" ? value.toString() : String(value ?? "0").trim();
    if (raw === "" || raw === "0") return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: "Interest rate must be a valid number with up to 2 decimal places." });
      return z.NEVER;
    }
    return Math.round(Number(raw) * 100);
  }),
  interestType: z.enum(["percentage", "fixed", "none"]).optional(),
  interestRatePeriod: z.enum(["monthly", "yearly", "one-time"]).optional(),
  loanType: z.enum(["lent", "borrowed"]).optional(),
  lendingDate: z.string().trim().refine(isValidIsoDate).optional(),
  dueDate: z.string().trim().refine(isValidIsoDate).nullable().optional(),
  interestStartDate: z.string().trim().refine(isValidIsoDate).nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional(),
  status: z.enum(["active", "settled", "cancelled"]).optional()
});

const createWalletLoanRepaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid repayment amount." });
      return z.NEVER;
    }
  }),
  repaymentDate: z.string().trim().refine(isValidIsoDate, "Repayment date must be a valid YYYY-MM-DD value."),
  notes: z.string().trim().max(280).nullable().optional()
});

const updateWalletLoanRepaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({ code: z.ZodIssueCode.custom, input: value, message: error instanceof Error ? error.message : "Invalid repayment amount." });
      return z.NEVER;
    }
  }),
  repaymentDate: z.string().trim().refine(isValidIsoDate, "Repayment date must be a valid YYYY-MM-DD value.").optional(),
  notes: z.string().trim().max(280).nullable().optional()
});

const reminderPreferencesSchema = z.object({
  dailyLoggingEnabled: z.boolean(),
  dailyLoggingHour: z.number().int().min(0).max(23),
  budgetAlertsEnabled: z.boolean(),
  budgetAlertThreshold: z.number().int().min(1).max(100),
  defaultCurrency: z.string().trim().min(1).max(10).optional(),
  defaultTimezone: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  photoUrl: z.string().trim().nullable().optional()
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

function mapWalletLoanRepayment(row) {
  return {
    id: row.id,
    loan_id: row.loan_id,
    amount: formatMinorUnits(Number(row.amount_minor)),
    repayment_date: asIsoDate(row.repayment_date),
    notes: row.notes,
    created_at: asIsoTimestamp(row.created_at)
  };
}

function isRawUserIdString(val) {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  return /^[0-9a-fA-F-]{20,}$/.test(trimmed) || trimmed.startsWith("auth0|") || trimmed.startsWith("user_");
}

function mapWalletLoan(row, repayments = [], viewingUserId) {
  const isOwner = viewingUserId ? row.owner_user_id === viewingUserId : true;
  const originalLoanType = row.loan_type || "lent";
  const displayLoanType = isOwner ? originalLoanType : (originalLoanType === "lent" ? "borrowed" : "lent");

  let rawCreatorName = row.creator_name;
  if (isRawUserIdString(rawCreatorName)) {
    rawCreatorName = null;
  }
  const creatorEmail = row.creator_email || null;
  const creatorName = rawCreatorName || (creatorEmail ? creatorEmail.split("@")[0] : "Loan Owner");

  let lenderMemberName = row.lender_member_name ?? "You";
  let borrowerMemberName = row.borrower_member_name ?? row.borrower_name ?? "Borrower";
  let borrowerName = row.borrower_name ?? row.borrower_member_name ?? null;
  let borrowerEmail = row.borrower_email ?? null;

  if (!isOwner) {
    borrowerName = creatorName;
    borrowerMemberName = creatorName;
    borrowerEmail = creatorEmail;
    lenderMemberName = creatorName;
  } else {
    if (isRawUserIdString(borrowerName)) {
      borrowerName = borrowerEmail ? borrowerEmail.split("@")[0] : "Borrower";
    }
    if (isRawUserIdString(borrowerMemberName)) {
      borrowerMemberName = borrowerName;
    }
    if (isRawUserIdString(lenderMemberName)) {
      lenderMemberName = "You";
    }
  }

  return {
    id: row.id,
    owner_user_id: row.owner_user_id ?? null,
    wallet_id: row.wallet_id ?? null,
    lender_member_id: row.lender_member_id ?? null,
    lender_member_name: lenderMemberName,
    borrower_member_id: row.borrower_member_id ?? null,
    borrower_member_name: borrowerMemberName,
    borrower_name: borrowerName,
    borrower_email: borrowerEmail,
    amount: formatMinorUnits(Number(row.amount_minor)),
    interest_rate: row.interest_rate_basis_points ? row.interest_rate_basis_points / 100 : 0,
    interest_type: row.interest_type,
    interest_rate_period: row.interest_rate_period,
    lending_date: asIsoDate(row.lending_date),
    due_date: row.due_date ? asIsoDate(row.due_date) : null,
    interest_start_date: row.interest_start_date ? asIsoDate(row.interest_start_date) : null,
    notes: row.notes,
    status: row.status,
    loan_type: displayLoanType,
    created_at: asIsoTimestamp(row.created_at),
    repayments,
    is_owner: isOwner,
    creator_name: creatorName,
    creator_email: creatorEmail
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
    read_at: row.read_at ? asIsoTimestamp(row.read_at) : null,
    scheduled_for: row.scheduled_for ? asIsoTimestamp(row.scheduled_for) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null
  };
}

function readFirebaseAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (clientEmail && clientEmail.startsWith("mailto:")) {
    clientEmail = clientEmail.substring(7);
  }

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
      name: decoded.name ?? null,
      emailVerified: Boolean(decoded.email_verified)
    };
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) {
      throw error;
    }

    throw new AuthenticationError("Your login session is invalid or expired.");
  }
}


async function safeSchemaStep(stepName, action) {
  try {
    await action();
  } catch (error) {
    console.error(`Schema step failed: ${stepName}`, error);
  }
}

function isUndefinedColumnError(err, column) {
  if (!err) return false;
  if (err.code === "42703") {
    if (!column) return true;
    const msg = typeof err.message === "string" ? err.message.toLowerCase() : "";
    const col = column.toLowerCase();
    const colName = typeof err.column_name === "string" ? err.column_name.toLowerCase() : "";
    return msg.includes(col) || colName === col;
  }
  return false;
}

async function ensureSchema(sql) {
  if (!RUN_SCHEMA_SETUP_ON_REQUEST) {
    return;
  }

  if (!schemaReady) {
    schemaReady = (async () => {
      await safeSchemaStep("create expenses table", () => sql`CREATE TABLE IF NOT EXISTS expenses (id UUID PRIMARY KEY, user_id TEXT, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), category VARCHAR(64) NOT NULL, description VARCHAR(280) NOT NULL, expense_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("expenses user_id column", () => sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT`);
      await safeSchemaStep("expenses user_id backfill", () => sql`UPDATE expenses SET user_id = 'legacy-anonymous' WHERE user_id IS NULL`);
      await safeSchemaStep("create budgets table", () => sql`CREATE TABLE IF NOT EXISTS budgets (id UUID PRIMARY KEY, user_id TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')), category VARCHAR(64), budget_month CHAR(7) NOT NULL, created_at TIMESTAMPTZ NOT NULL, CHECK ((budget_scope = 'monthly' AND category IS NULL) OR (budget_scope = 'category' AND category IS NOT NULL)))`);
      await safeSchemaStep("create wallets table", () => sql`CREATE TABLE IF NOT EXISTS wallets (id UUID PRIMARY KEY, owner_user_id TEXT NOT NULL, name VARCHAR(120) NOT NULL, description VARCHAR(280), default_split_rule VARCHAR(16) NOT NULL CHECK (default_split_rule IN ('equal', 'fixed', 'percentage')), created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create wallet_budgets table", () => sql`CREATE TABLE IF NOT EXISTS wallet_budgets (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), budget_scope VARCHAR(16) NOT NULL CHECK (budget_scope IN ('monthly', 'category')), category VARCHAR(64), budget_month CHAR(7) NOT NULL, created_at TIMESTAMPTZ NOT NULL, CHECK ((budget_scope = 'monthly' AND category IS NULL) OR (budget_scope = 'category' AND category IS NOT NULL)))`);
      await safeSchemaStep("create wallet_members table", () => sql`CREATE TABLE IF NOT EXISTS wallet_members (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, user_id TEXT, display_name VARCHAR(120) NOT NULL, email VARCHAR(160), member_role VARCHAR(16) NOT NULL CHECK (member_role IN ('owner', 'member')), invite_status VARCHAR(16) NOT NULL DEFAULT 'linked' CHECK (invite_status IN ('linked', 'pending', 'declined')), joined_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create wallet_expenses table", () => sql`CREATE TABLE IF NOT EXISTS wallet_expenses (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, paid_by_member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), category VARCHAR(64) NOT NULL, description VARCHAR(280) NOT NULL, expense_date DATE NOT NULL, split_rule VARCHAR(16) NOT NULL CHECK (split_rule IN ('equal', 'fixed', 'percentage')), created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create wallet_expense_splits table", () => sql`CREATE TABLE IF NOT EXISTS wallet_expense_splits (wallet_expense_id UUID NOT NULL REFERENCES wallet_expenses(id) ON DELETE CASCADE, member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0), percentage_basis_points INTEGER, PRIMARY KEY (wallet_expense_id, member_id))`);
      await safeSchemaStep("create wallet_settlements table", () => sql`CREATE TABLE IF NOT EXISTS wallet_settlements (id UUID PRIMARY KEY, wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, from_member_id UUID NOT NULL REFERENCES wallet_members(id), to_member_id UUID NOT NULL REFERENCES wallet_members(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), settlement_date DATE NOT NULL, note VARCHAR(280), created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create wallet_loans table", () => sql`CREATE TABLE IF NOT EXISTS wallet_loans (id UUID PRIMARY KEY, owner_user_id TEXT, wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE, lender_member_id UUID REFERENCES wallet_members(id), borrower_member_id UUID REFERENCES wallet_members(id), borrower_name VARCHAR(120), borrower_email VARCHAR(320), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), interest_rate_basis_points INTEGER NOT NULL DEFAULT 0, interest_type VARCHAR(16) NOT NULL DEFAULT 'percentage' CHECK (interest_type IN ('percentage', 'fixed', 'none')), interest_rate_period VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (interest_rate_period IN ('monthly', 'yearly', 'one-time')), lending_date DATE NOT NULL, due_date DATE, interest_start_date DATE, notes VARCHAR(280), status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')), created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("wallets picture_url column", () => sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS picture_url TEXT`);
      await safeSchemaStep("wallet_loans owner_user_id column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
      await safeSchemaStep("wallet_loans creator_name column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS creator_name VARCHAR(120)`);
      await safeSchemaStep("wallet_loans creator_email column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS creator_email VARCHAR(320)`);
      await safeSchemaStep("wallet_loans borrower_name column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS borrower_name VARCHAR(120)`);
      await safeSchemaStep("wallet_loans borrower_email column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS borrower_email VARCHAR(320)`);
      await safeSchemaStep("wallet_loans loan_type column", () => sql`ALTER TABLE wallet_loans ADD COLUMN IF NOT EXISTS loan_type VARCHAR(16) NOT NULL DEFAULT 'lent'`);
      await safeSchemaStep("wallet_loans drop not null constraints", async () => {
        await sql`ALTER TABLE wallet_loans ALTER COLUMN wallet_id DROP NOT NULL`;
        await sql`ALTER TABLE wallet_loans ALTER COLUMN lender_member_id DROP NOT NULL`;
        await sql`ALTER TABLE wallet_loans ALTER COLUMN borrower_member_id DROP NOT NULL`;
      });
      await safeSchemaStep("create wallet_loan_repayments table", () => sql`CREATE TABLE IF NOT EXISTS wallet_loan_repayments (id UUID PRIMARY KEY, loan_id UUID NOT NULL REFERENCES wallet_loans(id) ON DELETE CASCADE, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), repayment_date DATE NOT NULL, notes VARCHAR(280), created_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create notifications table", () => sql`CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY, user_id TEXT NOT NULL, notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN ('budget-threshold', 'budget-overspent', 'daily-log', 'bill-due', 'wallet-invite', 'invite-response', 'loan-issued', 'loan-overdue', 'loan-repayment')), title VARCHAR(120) NOT NULL, message VARCHAR(280) NOT NULL, notification_status VARCHAR(16) NOT NULL CHECK (notification_status IN ('unread', 'read')), scheduled_for TIMESTAMPTZ, metadata_json TEXT, dedupe_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE (user_id, dedupe_key))`);
      await safeSchemaStep("create reminder_preferences table", () => sql`CREATE TABLE IF NOT EXISTS reminder_preferences (user_id TEXT PRIMARY KEY, daily_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE, daily_logging_hour INTEGER NOT NULL DEFAULT 20 CHECK (daily_logging_hour BETWEEN 0 AND 23), budget_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE, budget_alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (budget_alert_threshold BETWEEN 1 AND 100), updated_at TIMESTAMPTZ NOT NULL)`);
      await safeSchemaStep("create bill_reminders table", () => sql`CREATE TABLE IF NOT EXISTS bill_reminders (id UUID PRIMARY KEY, user_id TEXT NOT NULL, title VARCHAR(120) NOT NULL, amount_minor BIGINT, category VARCHAR(64), due_date DATE NOT NULL, recurrence VARCHAR(16) NOT NULL CHECK (recurrence IN ('once', 'weekly', 'monthly', 'yearly')), interval_count INTEGER NOT NULL CHECK (interval_count BETWEEN 1 AND 24), reminder_days_before INTEGER NOT NULL CHECK (reminder_days_before BETWEEN 0 AND 60), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL)`);
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
      await safeSchemaStep("notifications read_at column", () => sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);
      await safeSchemaStep("notifications type backfill", () => sql`UPDATE notifications SET notification_type = 'daily-log' WHERE notification_type IS NULL`);
      await safeSchemaStep("notifications title backfill", () => sql`UPDATE notifications SET title = COALESCE(title, 'Notification') WHERE title IS NULL`);
      await safeSchemaStep("notifications message backfill", () => sql`UPDATE notifications SET message = COALESCE(message, '') WHERE message IS NULL`);
      await safeSchemaStep("notifications status backfill", () => sql`UPDATE notifications SET notification_status = 'unread' WHERE notification_status IS NULL`);
      await safeSchemaStep("notifications created at backfill", () => sql`UPDATE notifications SET created_at = NOW() WHERE created_at IS NULL`);
      await safeSchemaStep("notifications dedupe key backfill", () => sql`UPDATE notifications SET dedupe_key = CONCAT('legacy:', id::text) WHERE dedupe_key IS NULL OR dedupe_key = ''`);
      await safeSchemaStep("notifications type check drop", () => sql`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check`);
      await safeSchemaStep("notifications type check update", () => sql`ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN ('budget-threshold', 'budget-overspent', 'daily-log', 'bill-due', 'wallet-invite', 'invite-response', 'loan-issued', 'loan-overdue', 'loan-repayment'))`);
      await safeSchemaStep("wallet_loans backfill creator_name from wallet_members", () => sql`
        UPDATE wallet_loans wl
        SET creator_name = COALESCE(
          (SELECT display_name FROM wallet_members wm WHERE wm.wallet_id = wl.wallet_id AND wm.user_id = wl.owner_user_id AND wm.display_name IS NOT NULL AND wm.display_name != '' LIMIT 1),
          (SELECT display_name FROM wallet_members wm WHERE wm.user_id = wl.owner_user_id AND wm.display_name IS NOT NULL AND wm.display_name != '' ORDER BY wm.joined_at DESC LIMIT 1)
        )
        WHERE (wl.creator_name IS NULL OR wl.creator_name = wl.owner_user_id OR wl.creator_name = 'Creator' OR wl.creator_name = 'Loan Owner')
          AND wl.owner_user_id IS NOT NULL
      `);
      await safeSchemaStep("wallet_loans backfill creator_name from reminder_preferences", () => sql`
        UPDATE wallet_loans wl
        SET creator_name = rp.display_name
        FROM reminder_preferences rp
        WHERE (wl.creator_name IS NULL OR wl.creator_name = wl.owner_user_id OR wl.creator_name = 'Creator' OR wl.creator_name = 'Loan Owner')
          AND wl.owner_user_id IS NOT NULL
          AND rp.user_id = wl.owner_user_id
          AND rp.display_name IS NOT NULL
          AND rp.display_name != ''
      `);
      await safeSchemaStep("wallet_loans backfill creator_email from wallet_members", () => sql`
        UPDATE wallet_loans wl
        SET creator_email = COALESCE(
          (SELECT email FROM wallet_members wm WHERE wm.wallet_id = wl.wallet_id AND wm.user_id = wl.owner_user_id AND wm.email IS NOT NULL AND wm.email != '' LIMIT 1),
          (SELECT email FROM wallet_members wm WHERE wm.user_id = wl.owner_user_id AND wm.email IS NOT NULL AND wm.email != '' ORDER BY wm.joined_at DESC LIMIT 1)
        )
        WHERE wl.creator_email IS NULL
          AND wl.owner_user_id IS NOT NULL
      `);
      await safeSchemaStep("notifications backfill read_at", () => sql`
        UPDATE notifications
        SET read_at = created_at
        WHERE notification_status = 'read' AND read_at IS NULL
      `);
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
      await safeSchemaStep("reminder preferences default_currency column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS default_currency VARCHAR(10) DEFAULT 'USD'`);
      await safeSchemaStep("reminder preferences default_timezone column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS default_timezone VARCHAR(100) DEFAULT 'UTC'`);
      await safeSchemaStep("reminder preferences display_name column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) DEFAULT NULL`);
      await safeSchemaStep("reminder preferences photo_url column", () => sql`ALTER TABLE reminder_preferences ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL`);
      await safeSchemaStep("create mcp_access_tokens table", () => sql`
        CREATE TABLE IF NOT EXISTS mcp_access_tokens (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          label VARCHAR(255) NOT NULL,
          token_hash VARCHAR(255) NOT NULL UNIQUE,
          token_prefix VARCHAR(16) NOT NULL,
          token_suffix VARCHAR(16) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          last_used_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ
        )
      `);
      await safeSchemaStep("create rate_limits table", () => sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key VARCHAR(255) PRIMARY KEY,
          tokens DOUBLE PRECISION NOT NULL,
          last_refilled_at TIMESTAMPTZ NOT NULL
        )
      `);
      await safeSchemaStep("create pgvector extension", () => sql`
        CREATE EXTENSION IF NOT EXISTS vector
      `);
      await safeSchemaStep("create content_embeddings table", () => sql`
        CREATE TABLE IF NOT EXISTS content_embeddings (
          id UUID PRIMARY KEY,
          owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('expense', 'wallet_expense')),
          owner_id UUID NOT NULL,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          embedding vector(768),
          content_hash VARCHAR(64) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          embedding_pending BOOLEAN NOT NULL DEFAULT FALSE
        )
      `);
      await safeSchemaStep("create content_embeddings owner index", () => sql`
        CREATE UNIQUE INDEX IF NOT EXISTS content_embeddings_owner_idx ON content_embeddings (owner_id, owner_type)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
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

function parseWalletHistoryPagination(query = {}) {
  const parseLimit = (value) => {
    const numericValue = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return DEFAULT_WALLET_HISTORY_LIMIT;
    }
    return Math.min(numericValue, MAX_WALLET_HISTORY_LIMIT);
  };

  const parseOffset = (value) => {
    const numericValue = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return 0;
    }
    return numericValue;
  };

  return {
    expenseLimit: parseLimit(query.expenseLimit ?? query.limit),
    expenseOffset: parseOffset(query.expenseOffset ?? query.offset),
    settlementLimit: parseLimit(query.settlementLimit ?? query.limit),
    settlementOffset: parseOffset(query.settlementOffset ?? query.offset)
  };
}

async function loadWalletDetail(sql, walletId, pagination = parseWalletHistoryPagination()) {
  const walletRows = await sql`SELECT id, name, description, default_split_rule, created_at, picture_url FROM wallets WHERE id = ${walletId}`;
  if (!walletRows[0]) {
    throw new Error("Wallet not found.");
  }
  const walletBudgetRows = await sql`SELECT id, wallet_id, amount_minor, budget_scope, category, budget_month, created_at FROM wallet_budgets WHERE wallet_id = ${walletId} ORDER BY budget_month DESC, created_at DESC`;
  const members = await sql`SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at FROM wallet_members WHERE wallet_id = ${walletId} ORDER BY joined_at ASC`;
  const expenseCountRows = await sql`SELECT COUNT(*)::int AS total FROM wallet_expenses WHERE wallet_id = ${walletId}`;
  const expenseRows = await sql`
    SELECT wallet_expenses.id, wallet_expenses.wallet_id, wallet_expenses.paid_by_member_id, payer.display_name AS paid_by_member_name, wallet_expenses.amount_minor, wallet_expenses.category, wallet_expenses.description, wallet_expenses.expense_date, wallet_expenses.split_rule, wallet_expenses.created_at, wallet_expenses.platform
    FROM wallet_expenses
    INNER JOIN wallet_members AS payer ON payer.id = wallet_expenses.paid_by_member_id
    WHERE wallet_expenses.wallet_id = ${walletId}
    ORDER BY wallet_expenses.expense_date DESC, wallet_expenses.created_at DESC
    LIMIT ${pagination.expenseLimit}
    OFFSET ${pagination.expenseOffset}
  `;
  const splitRows = await sql`
    SELECT wallet_expense_splits.wallet_expense_id, wallet_expense_splits.member_id, wallet_members.display_name AS member_name, wallet_expense_splits.amount_minor, wallet_expense_splits.percentage_basis_points
    FROM wallet_expense_splits
    INNER JOIN wallet_members ON wallet_members.id = wallet_expense_splits.member_id
    INNER JOIN wallet_expenses ON wallet_expenses.id = wallet_expense_splits.wallet_expense_id
    WHERE wallet_expense_splits.wallet_expense_id IN (
      SELECT id
      FROM wallet_expenses
      WHERE wallet_id = ${walletId}
      ORDER BY expense_date DESC, created_at DESC
      LIMIT ${pagination.expenseLimit}
      OFFSET ${pagination.expenseOffset}
    )
  `;
  const settlementCountRows = await sql`SELECT COUNT(*)::int AS total FROM wallet_settlements WHERE wallet_id = ${walletId}`;
  const settlementRows = await sql`
    SELECT wallet_settlements.id, wallet_settlements.wallet_id, wallet_settlements.from_member_id, from_member.display_name AS from_member_name, wallet_settlements.to_member_id, to_member.display_name AS to_member_name, wallet_settlements.amount_minor, wallet_settlements.settlement_date, wallet_settlements.note, wallet_settlements.created_at
    FROM wallet_settlements
    INNER JOIN wallet_members AS from_member ON from_member.id = wallet_settlements.from_member_id
    INNER JOIN wallet_members AS to_member ON to_member.id = wallet_settlements.to_member_id
    WHERE wallet_settlements.wallet_id = ${walletId}
    ORDER BY wallet_settlements.settlement_date DESC, wallet_settlements.created_at DESC
    LIMIT ${pagination.settlementLimit}
    OFFSET ${pagination.settlementOffset}
  `;

  const splitMap = new Map();
  for (const split of splitRows) {
    const list = splitMap.get(split.wallet_expense_id) ?? [];
    list.push({ member_id: split.member_id, member_name: split.member_name, amount: formatMinorUnits(Number(split.amount_minor)), percentage: split.percentage_basis_points === null ? null : split.percentage_basis_points / 100 });
    splitMap.set(split.wallet_expense_id, list);
  }

  const balanceRows = await sql`
    SELECT wallet_members.id AS member_id,
           wallet_members.display_name AS member_name,
           COALESCE(SUM(balance_changes.amount_minor), 0)::bigint AS net_amount_minor
    FROM wallet_members
    LEFT JOIN (
      SELECT paid_by_member_id AS member_id, amount_minor
      FROM wallet_expenses
      WHERE wallet_id = ${walletId}
      UNION ALL
      SELECT wallet_expense_splits.member_id, -wallet_expense_splits.amount_minor AS amount_minor
      FROM wallet_expense_splits
      INNER JOIN wallet_expenses ON wallet_expenses.id = wallet_expense_splits.wallet_expense_id
      WHERE wallet_expenses.wallet_id = ${walletId}
      UNION ALL
      SELECT from_member_id AS member_id, amount_minor
      FROM wallet_settlements
      WHERE wallet_id = ${walletId}
      UNION ALL
      SELECT to_member_id AS member_id, -amount_minor AS amount_minor
      FROM wallet_settlements
      WHERE wallet_id = ${walletId}
    ) AS balance_changes ON balance_changes.member_id = wallet_members.id
    WHERE wallet_members.wallet_id = ${walletId}
    GROUP BY wallet_members.id, wallet_members.display_name
    ORDER BY net_amount_minor DESC
  `;

  const walletAggregationRows = await sql`
    SELECT
      COALESCE(SUM(amount_minor), 0) AS total_amount_minor,
      COUNT(*)::int AS expense_count
    FROM wallet_expenses
    WHERE wallet_id = ${walletId}
  `;

  const monthlyTotalsRows = await sql`
    SELECT
      TO_CHAR(expense_date, 'YYYY-MM') AS month,
      COALESCE(SUM(amount_minor), 0) AS total_minor,
      COUNT(*)::int AS expense_count
    FROM wallet_expenses
    WHERE wallet_id = ${walletId}
    GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
    ORDER BY month ASC
  `;

  const categoryTotalsRows = await sql`
    SELECT
      category,
      COALESCE(SUM(amount_minor), 0) AS total_minor,
      COUNT(*)::int AS expense_count,
      ARRAY_TO_STRING(ARRAY_AGG(DISTINCT COALESCE(NULLIF(platform, ''), 'others')), ',') AS platforms_str
    FROM wallet_expenses
    WHERE wallet_id = ${walletId}
    GROUP BY category
    ORDER BY total_minor DESC
  `;

  const categoryPlatformRows = await sql`
    SELECT
      category,
      COALESCE(NULLIF(platform, ''), 'others') AS platform,
      COALESCE(SUM(amount_minor), 0) AS total_minor
    FROM wallet_expenses
    WHERE wallet_id = ${walletId}
    GROUP BY category, platform
  `;

  const platformSharesByCategory = new Map();
  for (const r of categoryPlatformRows) {
    const shares = platformSharesByCategory.get(r.category) ?? [];
    shares.push({
      platform: r.platform,
      total: formatMinorUnits(Number(r.total_minor))
    });
    platformSharesByCategory.set(r.category, shares);
  }

  const budgetTotalsRows = await sql`
    SELECT
      TO_CHAR(expense_date, 'YYYY-MM') AS month,
      category,
      COALESCE(SUM(amount_minor), 0) AS total_minor
    FROM wallet_expenses
    WHERE wallet_id = ${walletId}
    GROUP BY TO_CHAR(expense_date, 'YYYY-MM'), category
  `;

  const totalAmount = formatMinorUnits(Number(walletAggregationRows[0]?.total_amount_minor ?? 0));
  const totalCount = Number(walletAggregationRows[0]?.expense_count ?? 0);

  const monthlyTotals = monthlyTotalsRows.map((r) => ({
    month: r.month,
    total: formatMinorUnits(Number(r.total_minor)),
    count: Number(r.expense_count)
  }));

  const categoryTotals = categoryTotalsRows.map((r) => ({
    category: r.category,
    total: formatMinorUnits(Number(r.total_minor)),
    count: Number(r.expense_count),
    platforms: r.platforms_str ? r.platforms_str.split(",") : [],
    platform_shares: platformSharesByCategory.get(r.category) ?? []
  }));

  const budgetTotals = budgetTotalsRows.map((r) => ({
    month: r.month,
    category: r.category,
    total: formatMinorUnits(Number(r.total_minor))
  }));

  const walletAggregation = {
    total_amount: totalAmount,
    expense_count: totalCount,
    monthly_totals: monthlyTotals,
    category_totals: categoryTotals,
    budget_totals: budgetTotals
  };

  const loanRows = await sql`
    SELECT wallet_loans.id,
           wallet_loans.owner_user_id,
           wallet_loans.wallet_id,
           wallet_loans.lender_member_id,
           COALESCE(lender_member.display_name, 'You') AS lender_member_name,
           wallet_loans.borrower_member_id,
           COALESCE(borrower_member.display_name, wallet_loans.borrower_name, 'Borrower') AS borrower_member_name,
           wallet_loans.borrower_name,
           wallet_loans.borrower_email,
           wallet_loans.amount_minor,
           wallet_loans.interest_rate_basis_points,
           wallet_loans.interest_type,
           wallet_loans.interest_rate_period,
           wallet_loans.lending_date,
           wallet_loans.due_date,
           wallet_loans.interest_start_date,
           wallet_loans.notes,
           wallet_loans.status,
           wallet_loans.loan_type,
           wallet_loans.created_at
    FROM wallet_loans
    LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
    LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
    WHERE wallet_loans.wallet_id = ${walletId}
    ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
  `;

  const loanIds = loanRows.map((loan) => loan.id);
  const repaymentRows = loanIds.length === 0 ? [] : await sql`
    SELECT id, loan_id, amount_minor, repayment_date, notes, created_at
    FROM wallet_loan_repayments
    WHERE loan_id = ANY(${loanIds})
    ORDER BY repayment_date ASC, created_at ASC
  `;

  const repaymentsByLoanId = new Map();
  for (const repayment of repaymentRows) {
    const records = repaymentsByLoanId.get(repayment.loan_id) ?? [];
    records.push(mapWalletLoanRepayment(repayment));
    repaymentsByLoanId.set(repayment.loan_id, records);
  }

  const loans = loanRows.map((loan) =>
    mapWalletLoan(loan, repaymentsByLoanId.get(loan.id) ?? [])
  );

  return {
    wallet: mapWallet(walletRows[0]),
    members: members.map(mapWalletMember),
    budgets: walletBudgetRows.map((budget) => ({ id: budget.id, wallet_id: budget.wallet_id, amount: formatMinorUnits(Number(budget.amount_minor)), scope: budget.budget_scope, category: budget.category, month: budget.budget_month, created_at: asIsoTimestamp(budget.created_at) })),
    expenses: expenseRows.map((expense) => ({ id: expense.id, wallet_id: expense.wallet_id, paid_by_member_id: expense.paid_by_member_id, paid_by_member_name: expense.paid_by_member_name, amount: formatMinorUnits(Number(expense.amount_minor)), category: expense.category, description: expense.description, date: asIsoDate(expense.expense_date), split_rule: expense.split_rule, created_at: asIsoTimestamp(expense.created_at), platform: expense.platform ?? null, splits: splitMap.get(expense.id) ?? [] })),
    balances: balanceRows.map((balance) => ({ member_id: balance.member_id, member_name: balance.member_name, net_amount: formatMinorUnits(Number(balance.net_amount_minor)) })),
    settlements: settlementRows.map((settlement) => ({ id: settlement.id, wallet_id: settlement.wallet_id, from_member_id: settlement.from_member_id, from_member_name: settlement.from_member_name, to_member_id: settlement.to_member_id, to_member_name: settlement.to_member_name, amount: formatMinorUnits(Number(settlement.amount_minor)), date: asIsoDate(settlement.settlement_date), note: settlement.note, created_at: asIsoTimestamp(settlement.created_at) })),
    loans,
    walletAggregation,
    expensePagination: {
      limit: pagination.expenseLimit,
      offset: pagination.expenseOffset,
      total: Number(expenseCountRows[0]?.total ?? 0),
      hasMore: pagination.expenseOffset + expenseRows.length < Number(expenseCountRows[0]?.total ?? 0)
    },
    settlementPagination: {
      limit: pagination.settlementLimit,
      offset: pagination.settlementOffset,
      total: Number(settlementCountRows[0]?.total ?? 0),
      hasMore: pagination.settlementOffset + settlementRows.length < Number(settlementCountRows[0]?.total ?? 0)
    }
  };
}

async function listWalletsForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT wallets.id, wallets.name, wallets.description, wallets.default_split_rule, wallets.created_at FROM wallets INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id WHERE wallet_members.user_id = ${userId} ORDER BY wallets.created_at DESC`;
  return { status: 200, body: { wallets: rows.map(mapWallet) } };
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
    await tx`INSERT INTO wallets (id, owner_user_id, name, description, default_split_rule, picture_url, created_at) VALUES (${walletId}, ${user.id}, ${result.data.name.trim()}, ${result.data.description?.trim() || null}, ${result.data.defaultSplitRule}, ${result.data.pictureUrl || null}, ${createdAt})`;
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

async function updateWalletForUser(userId, walletId, rawBody) {
  const result = createWalletSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const wallet = walletRows[0];
    if (!wallet) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (wallet.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can edit this group.");
    }

    if (result.data.pictureUrl !== undefined) {
      await tx`UPDATE wallets SET name = ${result.data.name.trim()}, description = ${result.data.description?.trim() || null}, default_split_rule = ${result.data.defaultSplitRule}, picture_url = ${result.data.pictureUrl || null} WHERE id = ${walletId}`;
    } else {
      await tx`UPDATE wallets SET name = ${result.data.name.trim()}, description = ${result.data.description?.trim() || null}, default_split_rule = ${result.data.defaultSplitRule} WHERE id = ${walletId}`;
    }

    const currentMembers = await tx`SELECT id, display_name, email, member_role FROM wallet_members WHERE wallet_id = ${walletId}`;
    const ownerMember = currentMembers.find((m) => m.member_role === "owner");
    const keptMemberIds = new Set();
    if (ownerMember) {
      keptMemberIds.add(ownerMember.id);
    }

    for (const member of result.data.members) {
      const normalizedName = member.displayName.trim();
      const normalizedEmail = member.email?.trim().toLowerCase() || null;

      if (ownerMember && (normalizedName.toLowerCase() === ownerMember.display_name.toLowerCase() || (normalizedEmail && ownerMember.email && normalizedEmail === ownerMember.email.toLowerCase()))) {
        continue;
      }

      let existingMember = null;
      if (normalizedEmail) {
        existingMember = currentMembers.find((m) => m.email && m.email.toLowerCase() === normalizedEmail);
      } else {
        existingMember = currentMembers.find((m) => m.display_name.toLowerCase() === normalizedName.toLowerCase());
      }

      if (existingMember) {
        if (existingMember.display_name !== normalizedName) {
          await tx`UPDATE wallet_members SET display_name = ${normalizedName} WHERE id = ${existingMember.id}`;
        }
        keptMemberIds.add(existingMember.id);
      } else {
        const newId = randomUUID();
        await tx`INSERT INTO wallet_members (id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at) VALUES (${newId}, ${walletId}, ${null}, ${normalizedName}, ${normalizedEmail}, ${"member"}, ${normalizedEmail ? "pending" : "linked"}, ${new Date().toISOString()})`;
        keptMemberIds.add(newId);
      }
    }

    for (const member of currentMembers) {
      if (keptMemberIds.has(member.id)) {
        continue;
      }

      const historyRows = await tx`
        SELECT
          EXISTS(SELECT 1 FROM wallet_expenses WHERE paid_by_member_id = ${member.id}) AS has_expenses,
          EXISTS(SELECT 1 FROM wallet_expense_splits WHERE member_id = ${member.id}) AS has_splits,
          EXISTS(SELECT 1 FROM wallet_settlements WHERE from_member_id = ${member.id} OR to_member_id = ${member.id}) AS has_settlements,
          EXISTS(SELECT 1 FROM wallet_loans WHERE lender_member_id = ${member.id} OR borrower_member_id = ${member.id}) AS has_loans
      `;

      const hasHistory = Boolean(historyRows[0]?.has_expenses || historyRows[0]?.has_splits || historyRows[0]?.has_settlements || historyRows[0]?.has_loans);

      if (hasHistory) {
        await tx`UPDATE wallet_members SET user_id = ${null}, email = ${null}, invite_status = ${"declined"} WHERE id = ${member.id}`;
      } else {
        await tx`DELETE FROM wallet_members WHERE id = ${member.id}`;
      }
    }

    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function getWalletForUser(userId, walletId, query = {}) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);
  return { status: 200, body: { wallet: await loadWalletDetail(sql, walletId, parseWalletHistoryPagination(query)) } };
}

async function getWalletExpensesForUser(userId, walletId, filters = {}) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await ensureWalletAccess(sql, userId, walletId);

  const query = sql`
    SELECT wallet_expenses.id, wallet_expenses.wallet_id, payer.display_name AS paid_by_member_name, 
           wallet_expenses.amount_minor, wallet_expenses.category, wallet_expenses.description, 
           wallet_expenses.expense_date, wallet_expenses.split_rule, wallet_expenses.platform
    FROM wallet_expenses
    INNER JOIN wallet_members AS payer ON payer.id = wallet_expenses.paid_by_member_id
    WHERE wallet_expenses.wallet_id = ${walletId}
    ORDER BY wallet_expenses.expense_date DESC, wallet_expenses.created_at DESC
  `;

  const rows = await query;
  return {
    status: 200,
    body: {
      expenses: rows.map(r => ({
        id: r.id,
        amount: (Number(r.amount_minor) / 100).toFixed(2),
        category: r.category,
        description: r.description,
        date: r.expense_date,
        paid_by: r.paid_by_member_name,
        platform: r.platform
      }))
    }
  };
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
        AND metadata_json <> ''
        AND LEFT(metadata_json, 1) = '{'
        AND metadata_json::jsonb ->> 'walletId' = ${walletId}
    `;

    await tx`DELETE FROM wallet_loan_repayments WHERE loan_id IN (SELECT id FROM wallet_loans WHERE wallet_id = ${walletId})`;
    await tx`DELETE FROM wallet_loans WHERE wallet_id = ${walletId}`;
    await tx`DELETE FROM wallet_expense_splits WHERE wallet_expense_id IN (SELECT id FROM wallet_expenses WHERE wallet_id = ${walletId})`;
    await tx`DELETE FROM wallet_expenses WHERE wallet_id = ${walletId}`;
    await tx`DELETE FROM wallet_settlements WHERE wallet_id = ${walletId}`;
    await tx`DELETE FROM wallet_budgets WHERE wallet_id = ${walletId}`;
    await tx`DELETE FROM wallet_members WHERE wallet_id = ${walletId}`;
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
        EXISTS(SELECT 1 FROM wallet_settlements WHERE from_member_id = ${membership.id} OR to_member_id = ${membership.id}) AS has_settlements,
        EXISTS(SELECT 1 FROM wallet_loans WHERE lender_member_id = ${membership.id} OR borrower_member_id = ${membership.id}) AS has_loans
    `;

    const hasHistory = Boolean(historyRows[0]?.has_expenses || historyRows[0]?.has_splits || historyRows[0]?.has_settlements || historyRows[0]?.has_loans);

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
        AND metadata_json <> ''
        AND LEFT(metadata_json, 1) = '{'
        AND metadata_json::jsonb ->> 'walletId' = ${walletId}
    `;
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

  if (!user.emailVerified) {
    return { status: 403, body: { error: "A verified email address is required to accept wallet invitations." } };
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

      const walletRows = await tx`SELECT name, owner_user_id FROM wallets WHERE id = ${invite.wallet_id}`;
      const wallet = walletRows[0];

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
          AND metadata_json <> ''
          AND LEFT(metadata_json, 1) = '{'
          AND metadata_json::jsonb ->> 'walletMemberId' = ${walletMemberId}
      `;

      if (wallet) {
        const displayName = user.name?.trim() || normalizedEmail;
        const verb = result.data.action === "accept" ? "accepted" : "declined";
        await upsertNotification(tx, {
          userId: wallet.owner_user_id,
          type: "invite-response",
          title: `${displayName} ${verb} your invite`,
          message: `${displayName} has ${verb} the invitation to join ${wallet.name}.`,
          scheduledFor: null,
          metadata: {
            walletId: invite.wallet_id,
            walletMemberId: invite.id,
            action: result.data.action,
            respondedBy: displayName
          },
          dedupeKey: `invite-response:${invite.id}`
        });
      }
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

async function removeWalletMemberForUser(userId, walletId, memberId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    if (!walletRows[0]) {
      throw new Error("Wallet not found.");
    }

    await ensureWalletAccess(tx, userId, walletId);

    if (walletRows[0].owner_user_id !== userId) {
      throw new Error("Only the wallet owner can remove members.");
    }

    const memberRows = await tx`
      SELECT id, wallet_id, user_id, display_name, email, member_role, invite_status, joined_at
      FROM wallet_members
      WHERE id = ${memberId} AND wallet_id = ${walletId}
    `;
    const member = memberRows[0];

    if (!member) {
      throw new Error("Wallet member not found.");
    }

    if (member.member_role === "owner") {
      throw new Error("Cannot remove the wallet owner.");
    }

    const historyRows = await tx`
      SELECT
        EXISTS(SELECT 1 FROM wallet_expenses WHERE paid_by_member_id = ${member.id}) AS has_expenses,
        EXISTS(SELECT 1 FROM wallet_expense_splits WHERE member_id = ${member.id}) AS has_splits,
        EXISTS(SELECT 1 FROM wallet_settlements WHERE from_member_id = ${member.id} OR to_member_id = ${member.id}) AS has_settlements,
        EXISTS(SELECT 1 FROM wallet_loans WHERE lender_member_id = ${member.id} OR borrower_member_id = ${member.id}) AS has_loans
    `;

    const hasHistory = Boolean(historyRows[0]?.has_expenses || historyRows[0]?.has_splits || historyRows[0]?.has_settlements || historyRows[0]?.has_loans);

    if (hasHistory) {
      await tx`
        UPDATE wallet_members
        SET user_id = ${null},
            email = ${null},
            invite_status = ${"declined"}
        WHERE id = ${member.id}
      `;
    } else {
      await tx`DELETE FROM wallet_members WHERE id = ${member.id}`;
    }

    await tx`
      DELETE FROM notifications
      WHERE metadata_json IS NOT NULL
        AND metadata_json <> ''
        AND LEFT(metadata_json, 1) = '{'
        AND metadata_json::jsonb ->> 'walletMemberId' = ${member.id}
    `;

    return loadWalletDetail(tx, walletId);
  });

  return { status: 200, body: { wallet } };
}

async function createWalletExpenseForUser(userId, walletId, rawBody) {
  const result = createWalletExpenseSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid wallet expense payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const expenseId = randomUUID();
  const wallet = await sql.begin(async (tx) => {
    await ensureWalletAccess(tx, userId, walletId);
    const memberRows = await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId}`;
    const memberIds = new Set(memberRows.map((row) => row.id));
    if (!memberIds.has(result.data.paidByMemberId) || result.data.splits.some((split) => !memberIds.has(split.memberId))) {
      throw new Error("One or more members do not belong to this wallet.");
    }
    await tx`INSERT INTO wallet_expenses (id, wallet_id, paid_by_member_id, amount_minor, category, description, expense_date, split_rule, created_at, platform) VALUES (${expenseId}, ${walletId}, ${result.data.paidByMemberId}, ${result.data.amount}, ${result.data.category.trim()}, ${result.data.description.trim()}, ${result.data.date}, ${result.data.splitRule}, ${new Date().toISOString()}, ${result.data.platform ?? null})`;
    const splits = result.data.splitRule === "equal" ? buildEqualSplits(result.data.amount, result.data.splits.map((split) => split.memberId)) : result.data.splitRule === "fixed" ? result.data.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null })) : buildPercentageSplits(result.data.amount, result.data.splits);
    for (const split of splits) {
      await tx`INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points) VALUES (${expenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})`;
    }
    return loadWalletDetail(tx, walletId);
  });
  await saveEmbedding(sql, userId, expenseId, "wallet_expense", result.data.category, result.data.description, result.data.amount, result.data.date, result.data.platform);
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
      SET paid_by_member_id = ${result.data.paidByMemberId}, amount_minor = ${result.data.amount}, category = ${result.data.category.trim()}, description = ${result.data.description.trim()}, expense_date = ${result.data.date}, split_rule = ${result.data.splitRule}, platform = ${result.data.platform ?? null}
      WHERE id = ${walletExpenseId} AND wallet_id = ${walletId}
    `;
    await tx`DELETE FROM wallet_expense_splits WHERE wallet_expense_id = ${walletExpenseId}`;
    const splits = result.data.splitRule === "equal" ? buildEqualSplits(result.data.amount, result.data.splits.map((split) => split.memberId)) : result.data.splitRule === "fixed" ? result.data.splits.map((split) => ({ memberId: split.memberId, amountMinor: split.value ?? 0, percentageBasisPoints: null })) : buildPercentageSplits(result.data.amount, result.data.splits);
    for (const split of splits) {
      await tx`INSERT INTO wallet_expense_splits (wallet_expense_id, member_id, amount_minor, percentage_basis_points) VALUES (${walletExpenseId}, ${split.memberId}, ${split.amountMinor}, ${split.percentageBasisPoints})`;
    }
    return loadWalletDetail(tx, walletId);
  });
  await saveEmbedding(sql, userId, walletExpenseId, "wallet_expense", result.data.category, result.data.description, result.data.amount, result.data.date, result.data.platform);
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
  await deleteEmbedding(sql, walletExpenseId, "wallet_expense");
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

async function createWalletLoanForUser(userId, walletId, rawBody) {
  const result = createWalletLoanSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can lend money and manage loans.");
    }

    const ownerMemberRows = await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId} AND user_id = ${userId}`;
    const ownerMember = ownerMemberRows[0];
    if (!ownerMember) {
      throw new Error("Owner member profile was not found.");
    }

    const borrowerRows = await tx`SELECT id, user_id, display_name, email FROM wallet_members WHERE wallet_id = ${walletId} AND id = ${result.data.borrowerMemberId}`;
    const borrower = borrowerRows[0];
    if (!borrower) {
      throw new Error("Borrower must be a member of this wallet.");
    }
    if (borrower.id === ownerMember.id) {
      throw new Error("Cannot create a loan to yourself.");
    }

    const newLoanId = randomUUID();
    await tx`
      INSERT INTO wallet_loans (
        id, wallet_id, lender_member_id, borrower_member_id, borrower_name, borrower_email, amount_minor,
        interest_rate_basis_points, interest_type, interest_rate_period, loan_type,
        lending_date, due_date, interest_start_date, notes, status, created_at
      ) VALUES (
        ${newLoanId},
        ${walletId},
        ${ownerMember.id},
        ${borrower.id},
        ${borrower.display_name},
        ${borrower.email},
        ${result.data.amount},
        ${result.data.interestRate},
        ${result.data.interestType},
        ${result.data.interestRatePeriod},
        ${result.data.loanType ?? "lent"},
        ${result.data.lendingDate},
        ${result.data.dueDate ?? null},
        ${result.data.interestStartDate ?? null},
        ${result.data.notes?.trim() || null},
        ${"active"},
        ${new Date().toISOString()}
      )
    `;

    let borrowerUserId = borrower.user_id;
    if (!borrowerUserId && borrower.email) {
      const matchRows = await tx`SELECT user_id FROM wallet_members WHERE user_id IS NOT NULL AND lower(email) = ${borrower.email.trim().toLowerCase()} LIMIT 1`;
      if (matchRows[0]?.user_id) borrowerUserId = matchRows[0].user_id;
    }

    if (borrowerUserId && borrowerUserId !== userId) {
      const isBorrowed = (result.data.loanType || "lent") === "borrowed";
      await upsertNotification(tx, {
        userId: borrowerUserId,
        type: "loan-issued",
        title: isBorrowed
          ? `Loan record added: ${formatMinorUnits(result.data.amount)}`
          : `New loan issued: ${formatMinorUnits(result.data.amount)}`,
        message: isBorrowed
          ? `${ownerMember.display_name ?? "A member"} recorded a borrowed loan of ${formatMinorUnits(result.data.amount)} from you in ${wallet.name}.${result.data.dueDate ? ` Due date: ${result.data.dueDate}.` : ""}`
          : `A loan of ${formatMinorUnits(result.data.amount)} was issued to you.${result.data.dueDate ? ` Due date: ${result.data.dueDate}.` : ""}`,
        scheduledFor: null,
        metadata: {
          loanId: newLoanId,
          walletId,
          amount: formatMinorUnits(result.data.amount),
          dueDate: result.data.dueDate || "",
          loanType: result.data.loanType || "lent"
        },
        dedupeKey: `loan-issued:${newLoanId}`
      });
    }

    return loadWalletDetail(tx, walletId);
  });
  return { status: 201, body: { wallet } };
}

async function updateWalletLoanForUser(userId, walletId, loanId, rawBody) {
  const result = updateWalletLoanSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can update loan terms and interest.");
    }

    const loanRows = await tx`SELECT id, borrower_member_id, amount_minor, interest_rate_basis_points, interest_type, interest_rate_period, lending_date, due_date, interest_start_date, notes, status FROM wallet_loans WHERE id = ${loanId} AND wallet_id = ${walletId}`;
    const currentLoan = loanRows[0];
    if (!currentLoan) {
      throw new Error("Loan not found.");
    }

    if (result.data.borrowerMemberId) {
      const borrowerRows = await tx`SELECT id FROM wallet_members WHERE wallet_id = ${walletId} AND id = ${result.data.borrowerMemberId}`;
      if (!borrowerRows[0]) {
        throw new Error("Borrower must be a member of this wallet.");
      }
    }

    const updatedBorrowerId = result.data.borrowerMemberId ?? currentLoan.borrower_member_id;
    const updatedAmountMinor = result.data.amount !== undefined ? result.data.amount : currentLoan.amount_minor;
    const updatedInterestRateBasisPoints = result.data.interestRate !== undefined ? result.data.interestRate : currentLoan.interest_rate_basis_points;
    const updatedInterestType = result.data.interestType ?? currentLoan.interest_type;
    const updatedInterestRatePeriod = result.data.interestRatePeriod ?? currentLoan.interest_rate_period;
    const updatedLendingDate = result.data.lendingDate ?? asIsoDate(currentLoan.lending_date);
    const updatedDueDate = result.data.dueDate !== undefined ? result.data.dueDate : (currentLoan.due_date ? asIsoDate(currentLoan.due_date) : null);
    const updatedInterestStartDate = result.data.interestStartDate !== undefined ? result.data.interestStartDate : (currentLoan.interest_start_date ? asIsoDate(currentLoan.interest_start_date) : null);
    const updatedNotes = result.data.notes !== undefined ? (result.data.notes?.trim() || null) : currentLoan.notes;
    const updatedStatus = result.data.status ?? currentLoan.status;
    const updatedLoanType = result.data.loanType ?? currentLoan.loan_type ?? "lent";

    await tx`
      UPDATE wallet_loans
      SET borrower_member_id = ${updatedBorrowerId},
          amount_minor = ${updatedAmountMinor},
          interest_rate_basis_points = ${updatedInterestRateBasisPoints},
          interest_type = ${updatedInterestType},
          interest_rate_period = ${updatedInterestRatePeriod},
          loan_type = ${updatedLoanType},
          lending_date = ${updatedLendingDate},
          due_date = ${updatedDueDate},
          interest_start_date = ${updatedInterestStartDate},
          notes = ${updatedNotes},
          status = ${updatedStatus}
      WHERE id = ${loanId} AND wallet_id = ${walletId}
    `;

    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function deleteWalletLoanForUser(userId, walletId, loanId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can delete loans.");
    }

    const rows = await tx`DELETE FROM wallet_loans WHERE id = ${loanId} AND wallet_id = ${walletId} RETURNING id`;
    if (!rows[0]) {
      throw new Error("Loan not found.");
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function createWalletLoanRepaymentForUser(userId, walletId, loanId, rawBody) {
  const result = createWalletLoanRepaymentSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan repayment payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can record loan repayments.");
    }

    const loanRows = await tx`SELECT id FROM wallet_loans WHERE id = ${loanId} AND wallet_id = ${walletId}`;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    await tx`
      INSERT INTO wallet_loan_repayments (id, loan_id, amount_minor, repayment_date, notes, created_at)
      VALUES (
        ${randomUUID()},
        ${loanId},
        ${result.data.amount},
        ${result.data.repaymentDate},
        ${result.data.notes?.trim() || null},
        ${new Date().toISOString()}
      )
    `;

    return loadWalletDetail(tx, walletId);
  });
  return { status: 201, body: { wallet } };
}

async function updateWalletLoanRepaymentForUser(userId, walletId, loanId, repaymentId, rawBody) {
  const result = updateWalletLoanRepaymentSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan repayment payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can update loan repayments.");
    }

    const loanRows = await tx`SELECT id FROM wallet_loans WHERE id = ${loanId} AND wallet_id = ${walletId}`;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    const repRows = await tx`SELECT id, amount_minor, repayment_date, notes FROM wallet_loan_repayments WHERE id = ${repaymentId} AND loan_id = ${loanId}`;
    const currentRep = repRows[0];
    if (!currentRep) {
      throw new Error("Repayment not found.");
    }

    const updatedAmount = result.data.amount !== undefined ? result.data.amount : currentRep.amount_minor;
    const updatedDate = result.data.repaymentDate !== undefined ? result.data.repaymentDate : asIsoDate(currentRep.repayment_date);
    const updatedNotes = result.data.notes !== undefined ? (result.data.notes?.trim() || null) : currentRep.notes;

    await tx`
      UPDATE wallet_loan_repayments
      SET amount_minor = ${updatedAmount},
          repayment_date = ${updatedDate},
          notes = ${updatedNotes}
      WHERE id = ${repaymentId} AND loan_id = ${loanId}
    `;

    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function deleteWalletLoanRepaymentForUser(userId, walletId, loanId, repaymentId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const wallet = await sql.begin(async (tx) => {
    const walletRows = await tx`SELECT owner_user_id FROM wallets WHERE id = ${walletId}`;
    const walletRecord = walletRows[0];
    if (!walletRecord) {
      throw new Error("Wallet not found.");
    }
    await ensureWalletAccess(tx, userId, walletId);
    if (walletRecord.owner_user_id !== userId) {
      throw new Error("Only the wallet owner can delete loan repayments.");
    }

    const loanRows = await tx`SELECT id FROM wallet_loans WHERE id = ${loanId} AND wallet_id = ${walletId}`;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    const rows = await tx`DELETE FROM wallet_loan_repayments WHERE id = ${repaymentId} AND loan_id = ${loanId} RETURNING id`;
    if (!rows[0]) {
      throw new Error("Repayment not found.");
    }
    return loadWalletDetail(tx, walletId);
  });
  return { status: 200, body: { wallet } };
}

async function loadLoanRecord(sql, loanId, viewingUserId) {
  const loanRows = await sql`
    SELECT wallet_loans.id,
           wallet_loans.owner_user_id,
           wallet_loans.wallet_id,
           wallet_loans.lender_member_id,
           COALESCE(lender_member.display_name, 'You') AS lender_member_name,
           wallet_loans.borrower_member_id,
           COALESCE(borrower_member.display_name, wallet_loans.borrower_name, 'Borrower') AS borrower_member_name,
           wallet_loans.borrower_name,
           wallet_loans.borrower_email,
           wallet_loans.amount_minor,
           wallet_loans.interest_rate_basis_points,
           wallet_loans.interest_type,
           wallet_loans.interest_rate_period,
           wallet_loans.lending_date,
           wallet_loans.due_date,
           wallet_loans.interest_start_date,
           wallet_loans.notes,
           wallet_loans.status,
           wallet_loans.loan_type,
           wallet_loans.created_at,
           COALESCE(
             wallet_loans.creator_name,
             owner_pref.display_name,
             owner_member.display_name,
             wallet_loans.borrower_name
           ) AS creator_name,
           COALESCE(
             wallet_loans.creator_email,
             owner_member.email
           ) AS creator_email
    FROM wallet_loans
    LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
    LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
    LEFT JOIN reminder_preferences AS owner_pref ON owner_pref.user_id = wallet_loans.owner_user_id
    LEFT JOIN LATERAL (
      SELECT wm.display_name, wm.email
      FROM wallet_members wm
      WHERE wm.user_id = wallet_loans.owner_user_id
      ORDER BY (wallet_loans.wallet_id IS NOT NULL AND wm.wallet_id = wallet_loans.wallet_id) DESC, (wm.display_name IS NOT NULL AND wm.display_name != '') DESC, wm.joined_at DESC
      LIMIT 1
    ) AS owner_member ON TRUE
    WHERE wallet_loans.id = ${loanId}
  `;
  const loan = loanRows[0];
  if (!loan) {
    throw new Error("Loan not found.");
  }

  const repaymentRows = await sql`
    SELECT id, loan_id, amount_minor, repayment_date, notes, created_at
    FROM wallet_loan_repayments
    WHERE loan_id = ${loanId}
    ORDER BY repayment_date ASC, created_at ASC
  `;

  return mapWalletLoan(loan, repaymentRows.map(mapWalletLoanRepayment), viewingUserId);
}

async function listLoansForUser(userId, userEmail, emailVerified = true) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const normalizedEmail = userEmail && emailVerified ? userEmail.trim().toLowerCase() : null;

  let loanRows;
  try {
    loanRows = await sql`
      SELECT wallet_loans.id,
             wallet_loans.owner_user_id,
             wallet_loans.wallet_id,
             wallet_loans.lender_member_id,
             COALESCE(lender_member.display_name, 'You') AS lender_member_name,
             wallet_loans.borrower_member_id,
             COALESCE(borrower_member.display_name, wallet_loans.borrower_name, 'Borrower') AS borrower_member_name,
             wallet_loans.borrower_name,
             wallet_loans.borrower_email,
             wallet_loans.amount_minor,
             wallet_loans.interest_rate_basis_points,
             wallet_loans.interest_type,
             wallet_loans.interest_rate_period,
             wallet_loans.lending_date,
             wallet_loans.due_date,
             wallet_loans.interest_start_date,
             wallet_loans.notes,
             wallet_loans.status,
             wallet_loans.loan_type,
             wallet_loans.created_at,
             COALESCE(
               wallet_loans.creator_name,
               owner_pref.display_name,
               owner_member.display_name,
               wallet_loans.borrower_name
             ) AS creator_name,
             COALESCE(
               wallet_loans.creator_email,
               owner_member.email
             ) AS creator_email
      FROM wallet_loans
      LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
      LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
      LEFT JOIN reminder_preferences AS owner_pref ON owner_pref.user_id = wallet_loans.owner_user_id
      LEFT JOIN LATERAL (
        SELECT wm.display_name, wm.email
        FROM wallet_members wm
        WHERE wm.user_id = wallet_loans.owner_user_id
        ORDER BY (wallet_loans.wallet_id IS NOT NULL AND wm.wallet_id = wallet_loans.wallet_id) DESC, (wm.display_name IS NOT NULL AND wm.display_name != '') DESC, wm.joined_at DESC
        LIMIT 1
      ) AS owner_member ON TRUE
      WHERE wallet_loans.owner_user_id = ${userId}
         OR (${normalizedEmail}::text IS NOT NULL AND wallet_loans.borrower_email IS NOT NULL AND lower(wallet_loans.borrower_email) = ${normalizedEmail})
         OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
      ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
    `;
  } catch (primaryErr) {
    console.warn("Retrying listLoansForUser with reduced enrichment fallback:", primaryErr);
    try {
      loanRows = await sql`
        SELECT wallet_loans.id,
               wallet_loans.owner_user_id,
               wallet_loans.wallet_id,
               wallet_loans.lender_member_id,
               COALESCE(lender_member.display_name, 'You') AS lender_member_name,
               wallet_loans.borrower_member_id,
               COALESCE(borrower_member.display_name, wallet_loans.borrower_name, 'Borrower') AS borrower_member_name,
               wallet_loans.borrower_name,
               wallet_loans.borrower_email,
               wallet_loans.amount_minor,
               wallet_loans.interest_rate_basis_points,
               wallet_loans.interest_type,
               wallet_loans.interest_rate_period,
               wallet_loans.lending_date,
               wallet_loans.due_date,
               wallet_loans.interest_start_date,
               wallet_loans.notes,
               wallet_loans.status,
               COALESCE(wallet_loans.loan_type, 'lent') AS loan_type,
               wallet_loans.created_at,
               'Loan Owner' AS creator_name,
               NULL AS creator_email
        FROM wallet_loans
        LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
        LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
        WHERE wallet_loans.owner_user_id = ${userId}
           OR (${normalizedEmail}::text IS NOT NULL AND wallet_loans.borrower_email IS NOT NULL AND lower(wallet_loans.borrower_email) = ${normalizedEmail})
           OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
        ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
      `;
    } catch (reducedErr) {
      if (isUndefinedColumnError(reducedErr, "borrower_name")) {
        console.warn("Retrying listLoansForUser without borrower_name, keeping borrower_email:", reducedErr);
        try {
          loanRows = await sql`
            SELECT wallet_loans.id,
                   wallet_loans.owner_user_id,
                   wallet_loans.wallet_id,
                   wallet_loans.lender_member_id,
                   COALESCE(lender_member.display_name, 'You') AS lender_member_name,
                   wallet_loans.borrower_member_id,
                   COALESCE(borrower_member.display_name, 'Borrower') AS borrower_member_name,
                   NULL AS borrower_name,
                   wallet_loans.borrower_email,
                   wallet_loans.amount_minor,
                   wallet_loans.interest_rate_basis_points,
                   wallet_loans.interest_type,
                   wallet_loans.interest_rate_period,
                   wallet_loans.lending_date,
                   wallet_loans.due_date,
                   wallet_loans.interest_start_date,
                   wallet_loans.notes,
                   wallet_loans.status,
                   COALESCE(wallet_loans.loan_type, 'lent') AS loan_type,
                   wallet_loans.created_at,
                   'Loan Owner' AS creator_name,
                   NULL AS creator_email
            FROM wallet_loans
            LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
            LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
            WHERE wallet_loans.owner_user_id = ${userId}
               OR (${normalizedEmail}::text IS NOT NULL AND wallet_loans.borrower_email IS NOT NULL AND lower(wallet_loans.borrower_email) = ${normalizedEmail})
               OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
            ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
          `;
        } catch (noNameErr) {
          if (!isUndefinedColumnError(noNameErr, "borrower_email")) {
            throw noNameErr;
          }
          console.warn("Retrying listLoansForUser without borrower_email predicate:", noNameErr);
          loanRows = await sql`
            SELECT wallet_loans.id,
                   wallet_loans.owner_user_id,
                   wallet_loans.wallet_id,
                   wallet_loans.lender_member_id,
                   COALESCE(lender_member.display_name, 'You') AS lender_member_name,
                   wallet_loans.borrower_member_id,
                   COALESCE(borrower_member.display_name, 'Borrower') AS borrower_member_name,
                   NULL AS borrower_name,
                   NULL AS borrower_email,
                   wallet_loans.amount_minor,
                   wallet_loans.interest_rate_basis_points,
                   wallet_loans.interest_type,
                   wallet_loans.interest_rate_period,
                   wallet_loans.lending_date,
                   wallet_loans.due_date,
                   wallet_loans.interest_start_date,
                   wallet_loans.notes,
                   wallet_loans.status,
                   COALESCE(wallet_loans.loan_type, 'lent') AS loan_type,
                   wallet_loans.created_at,
                   'Loan Owner' AS creator_name,
                   NULL AS creator_email
            FROM wallet_loans
            LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
            LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
            WHERE wallet_loans.owner_user_id = ${userId}
               OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
            ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
          `;
        }
      } else if (isUndefinedColumnError(reducedErr, "borrower_email")) {
        console.warn("Retrying listLoansForUser without borrower_email predicate, keeping borrower_name:", reducedErr);
        try {
          loanRows = await sql`
            SELECT wallet_loans.id,
                   wallet_loans.owner_user_id,
                   wallet_loans.wallet_id,
                   wallet_loans.lender_member_id,
                   COALESCE(lender_member.display_name, 'You') AS lender_member_name,
                   wallet_loans.borrower_member_id,
                   COALESCE(borrower_member.display_name, wallet_loans.borrower_name, 'Borrower') AS borrower_member_name,
                   wallet_loans.borrower_name,
                   NULL AS borrower_email,
                   wallet_loans.amount_minor,
                   wallet_loans.interest_rate_basis_points,
                   wallet_loans.interest_type,
                   wallet_loans.interest_rate_period,
                   wallet_loans.lending_date,
                   wallet_loans.due_date,
                   wallet_loans.interest_start_date,
                   wallet_loans.notes,
                   wallet_loans.status,
                   COALESCE(wallet_loans.loan_type, 'lent') AS loan_type,
                   wallet_loans.created_at,
                   'Loan Owner' AS creator_name,
                   NULL AS creator_email
            FROM wallet_loans
            LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
            LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
            WHERE wallet_loans.owner_user_id = ${userId}
               OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
            ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
          `;
        } catch (noEmailErr) {
          if (!isUndefinedColumnError(noEmailErr, "borrower_name")) {
            throw noEmailErr;
          }
          console.warn("Retrying listLoansForUser with neither borrower_email nor borrower_name:", noEmailErr);
          loanRows = await sql`
            SELECT wallet_loans.id,
                   wallet_loans.owner_user_id,
                   wallet_loans.wallet_id,
                   wallet_loans.lender_member_id,
                   COALESCE(lender_member.display_name, 'You') AS lender_member_name,
                   wallet_loans.borrower_member_id,
                   COALESCE(borrower_member.display_name, 'Borrower') AS borrower_member_name,
                   NULL AS borrower_name,
                   NULL AS borrower_email,
                   wallet_loans.amount_minor,
                   wallet_loans.interest_rate_basis_points,
                   wallet_loans.interest_type,
                   wallet_loans.interest_rate_period,
                   wallet_loans.lending_date,
                   wallet_loans.due_date,
                   wallet_loans.interest_start_date,
                   wallet_loans.notes,
                   wallet_loans.status,
                   COALESCE(wallet_loans.loan_type, 'lent') AS loan_type,
                   wallet_loans.created_at,
                   'Loan Owner' AS creator_name,
                   NULL AS creator_email
            FROM wallet_loans
            LEFT JOIN wallet_members AS lender_member ON lender_member.id = wallet_loans.lender_member_id
            LEFT JOIN wallet_members AS borrower_member ON borrower_member.id = wallet_loans.borrower_member_id
            WHERE wallet_loans.owner_user_id = ${userId}
               OR wallet_loans.borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId})
            ORDER BY wallet_loans.lending_date DESC, wallet_loans.created_at DESC
          `;
        }
      } else {
        throw reducedErr;
      }
    }
  }

  const loanIds = loanRows.map((loan) => loan.id);
  const repaymentRows = loanIds.length === 0 ? [] : await sql`
    SELECT id, loan_id, amount_minor, repayment_date, notes, created_at
    FROM wallet_loan_repayments
    WHERE loan_id = ANY(${loanIds})
    ORDER BY repayment_date ASC, created_at ASC
  `;

  const repaymentsByLoanId = new Map();
  for (const repayment of repaymentRows) {
    const records = repaymentsByLoanId.get(repayment.loan_id) ?? [];
    records.push(mapWalletLoanRepayment(repayment));
    repaymentsByLoanId.set(repayment.loan_id, records);
  }

  const loans = loanRows.map((loan) => mapWalletLoan(loan, repaymentsByLoanId.get(loan.id) ?? [], userId));
  return { status: 200, body: { loans } };
}

async function createStandaloneLoanForUser(userId, rawBody, userName = null, userEmail = null) {
  const result = createWalletLoanSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);

  const loan = await sql.begin(async (tx) => {
    let creatorName = result.data.creatorName?.trim() || (userName && !isRawUserIdString(userName) ? userName.trim() : null);
    let creatorEmail = result.data.creatorEmail?.trim() || userEmail?.trim() || null;

    if (!creatorName) {
      const prefRows = await tx`SELECT display_name FROM reminder_preferences WHERE user_id = ${userId} LIMIT 1`;
      if (prefRows[0]?.display_name && !isRawUserIdString(prefRows[0].display_name)) {
        creatorName = prefRows[0].display_name;
      }
    }
    if (!creatorName || !creatorEmail) {
      const memberRows = await tx`
        SELECT display_name, email FROM wallet_members 
        WHERE user_id = ${userId} 
        ORDER BY (display_name IS NOT NULL AND display_name != '') DESC, joined_at DESC 
        LIMIT 1
      `;
      if (memberRows[0]) {
        if (!creatorName && memberRows[0].display_name && !isRawUserIdString(memberRows[0].display_name)) {
          creatorName = memberRows[0].display_name;
        }
        if (!creatorEmail && memberRows[0].email) {
          creatorEmail = memberRows[0].email;
        }
      }
    }

    const loanId = randomUUID();
    await tx`
      INSERT INTO wallet_loans (
        id, owner_user_id, wallet_id, lender_member_id, borrower_member_id,
        borrower_name, borrower_email, amount_minor,
        interest_rate_basis_points, interest_type, interest_rate_period, loan_type,
        lending_date, due_date, interest_start_date, notes, status, created_at,
        creator_name, creator_email
      ) VALUES (
        ${loanId},
        ${userId},
        ${result.data.walletId ?? null},
        ${null},
        ${result.data.borrowerMemberId ?? null},
        ${result.data.borrowerName?.trim() || "Borrower"},
        ${result.data.borrowerEmail?.trim() || null},
        ${result.data.amount},
        ${result.data.interestRate},
        ${result.data.interestType},
        ${result.data.interestRatePeriod},
        ${result.data.loanType ?? "lent"},
        ${result.data.lendingDate},
        ${result.data.dueDate ?? null},
        ${result.data.interestStartDate ?? null},
        ${result.data.notes?.trim() || null},
        ${"active"},
        ${new Date().toISOString()},
        ${creatorName},
        ${creatorEmail}
      )
    `;

    if (result.data.borrowerEmail?.trim()) {
      const normEmail = result.data.borrowerEmail.trim().toLowerCase();
      const matchUsers = await tx`
        SELECT user_id FROM wallet_members WHERE user_id IS NOT NULL AND lower(email) = ${normEmail} LIMIT 1
      `;
      const borrowerUserId = matchUsers[0]?.user_id;
      if (borrowerUserId && borrowerUserId !== userId) {
        const isBorrowed = (result.data.loanType || "lent") === "borrowed";
        await upsertNotification(tx, {
          userId: borrowerUserId,
          type: "loan-issued",
          title: isBorrowed
            ? `Loan record added: ${formatMinorUnits(result.data.amount)}`
            : `New loan issued: ${formatMinorUnits(result.data.amount)}`,
          message: isBorrowed
            ? `A loan record of ${formatMinorUnits(result.data.amount)} borrowed from you was recorded.${result.data.dueDate ? ` Due date: ${result.data.dueDate}.` : ""}`
            : `A loan of ${formatMinorUnits(result.data.amount)} was issued to you.${result.data.dueDate ? ` Due date: ${result.data.dueDate}.` : ""}`,
          scheduledFor: null,
          metadata: {
            loanId,
            amount: formatMinorUnits(result.data.amount),
            dueDate: result.data.dueDate || "",
            loanType: result.data.loanType || "lent"
          },
          dedupeKey: `loan-issued:${loanId}`
        });
      }
    }

    return loadLoanRecord(tx, loanId);
  });

  return { status: 201, body: { loan } };
}

async function updateStandaloneLoanForUser(userId, loanId, rawBody) {
  const result = updateWalletLoanSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);

  const loan = await sql.begin(async (tx) => {
    const loanRows = await tx`SELECT id, owner_user_id, borrower_name, borrower_email, borrower_member_id, amount_minor, interest_rate_basis_points, interest_type, interest_rate_period, lending_date, due_date, interest_start_date, notes, status FROM wallet_loans WHERE id = ${loanId} AND owner_user_id = ${userId}`;
    const currentLoan = loanRows[0];
    if (!currentLoan) {
      throw new Error("Loan not found.");
    }

    const updatedBorrowerName = result.data.borrowerName !== undefined ? (result.data.borrowerName?.trim() || null) : currentLoan.borrower_name;
    const updatedBorrowerEmail = result.data.borrowerEmail !== undefined ? (result.data.borrowerEmail?.trim() || null) : currentLoan.borrower_email;
    const updatedBorrowerMemberId = result.data.borrowerMemberId !== undefined ? result.data.borrowerMemberId : currentLoan.borrower_member_id;
    const updatedAmountMinor = result.data.amount !== undefined ? result.data.amount : currentLoan.amount_minor;
    const updatedInterestRateBasisPoints = result.data.interestRate !== undefined ? result.data.interestRate : currentLoan.interest_rate_basis_points;
    const updatedInterestType = result.data.interestType ?? currentLoan.interest_type;
    const updatedInterestRatePeriod = result.data.interestRatePeriod ?? currentLoan.interest_rate_period;
    const updatedLendingDate = result.data.lendingDate ?? asIsoDate(currentLoan.lending_date);
    const updatedDueDate = result.data.dueDate !== undefined ? result.data.dueDate : (currentLoan.due_date ? asIsoDate(currentLoan.due_date) : null);
    const updatedInterestStartDate = result.data.interestStartDate !== undefined ? result.data.interestStartDate : (currentLoan.interest_start_date ? asIsoDate(currentLoan.interest_start_date) : null);
    const updatedNotes = result.data.notes !== undefined ? (result.data.notes?.trim() || null) : currentLoan.notes;
    const updatedStatus = result.data.status ?? currentLoan.status;
    const updatedLoanType = result.data.loanType ?? currentLoan.loan_type ?? "lent";

    await tx`
      UPDATE wallet_loans
      SET borrower_name = ${updatedBorrowerName},
          borrower_email = ${updatedBorrowerEmail},
          borrower_member_id = ${updatedBorrowerMemberId},
          amount_minor = ${updatedAmountMinor},
          interest_rate_basis_points = ${updatedInterestRateBasisPoints},
          interest_type = ${updatedInterestType},
          interest_rate_period = ${updatedInterestRatePeriod},
          loan_type = ${updatedLoanType},
          lending_date = ${updatedLendingDate},
          due_date = ${updatedDueDate},
          interest_start_date = ${updatedInterestStartDate},
          notes = ${updatedNotes},
          status = ${updatedStatus}
      WHERE id = ${loanId} AND owner_user_id = ${userId}
    `;

    return loadLoanRecord(tx, loanId);
  });

  return { status: 200, body: { loan } };
}

async function deleteStandaloneLoanForUser(userId, loanId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`DELETE FROM wallet_loans WHERE id = ${loanId} AND owner_user_id = ${userId} RETURNING id`;
  if (!rows[0]) {
    throw new Error("Loan not found.");
  }
  return { status: 200, body: { ok: true } };
}

async function createStandaloneLoanRepaymentForUser(userId, loanId, rawBody, userEmail, emailVerified = true) {
  const result = createWalletLoanRepaymentSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan repayment payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);
  const normalizedEmail = userEmail && emailVerified ? userEmail.trim().toLowerCase() : null;

  const loan = await sql.begin(async (tx) => {
    const loanRows = await tx`
      SELECT id, owner_user_id 
      FROM wallet_loans 
      WHERE id = ${loanId} 
        AND (owner_user_id = ${userId}
             OR (${normalizedEmail}::text IS NOT NULL AND borrower_email IS NOT NULL AND lower(borrower_email) = ${normalizedEmail})
             OR borrower_member_id IN (SELECT id FROM wallet_members WHERE user_id = ${userId}))
    `;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    await tx`
      INSERT INTO wallet_loan_repayments (id, loan_id, amount_minor, repayment_date, notes, created_at)
      VALUES (
        ${randomUUID()},
        ${loanId},
        ${result.data.amount},
        ${result.data.repaymentDate},
        ${result.data.notes?.trim() || null},
        ${new Date().toISOString()}
      )
    `;

    if (loanRows[0].owner_user_id && loanRows[0].owner_user_id !== userId) {
      const repaymentAmountStr = formatMinorUnits(result.data.amount);
      await upsertNotification(tx, {
        userId: loanRows[0].owner_user_id,
        type: "loan-repayment",
        title: `Repayment recorded: ${repaymentAmountStr}`,
        message: `A repayment of ${repaymentAmountStr} was recorded for your loan.`,
        scheduledFor: null,
        metadata: {
          loanId,
          amount: repaymentAmountStr,
          repaymentDate: result.data.repaymentDate
        },
        dedupeKey: `loan-repayment:${loanId}:${randomUUID()}`
      });
    }

    return loadLoanRecord(tx, loanId, userId);
  });

  return { status: 201, body: { loan } };
}

async function deleteStandaloneLoanRepaymentForUser(userId, loanId, repaymentId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const loan = await sql.begin(async (tx) => {
    const loanRows = await tx`SELECT id FROM wallet_loans WHERE id = ${loanId} AND owner_user_id = ${userId}`;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    const rows = await tx`DELETE FROM wallet_loan_repayments WHERE id = ${repaymentId} AND loan_id = ${loanId} RETURNING id`;
    if (!rows[0]) {
      throw new Error("Repayment not found.");
    }

    return loadLoanRecord(tx, loanId);
  });

  return { status: 200, body: { loan } };
}

async function updateStandaloneLoanRepaymentForUser(userId, loanId, repaymentId, rawBody) {
  const result = updateWalletLoanRepaymentSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid loan repayment payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);

  const loan = await sql.begin(async (tx) => {
    const loanRows = await tx`SELECT id FROM wallet_loans WHERE id = ${loanId} AND owner_user_id = ${userId}`;
    if (!loanRows[0]) {
      throw new Error("Loan not found.");
    }

    const repRows = await tx`SELECT id, amount_minor, repayment_date, notes FROM wallet_loan_repayments WHERE id = ${repaymentId} AND loan_id = ${loanId}`;
    const currentRep = repRows[0];
    if (!currentRep) {
      throw new Error("Repayment not found.");
    }

    const updatedAmount = result.data.amount !== undefined ? result.data.amount : currentRep.amount_minor;
    const updatedDate = result.data.repaymentDate !== undefined ? result.data.repaymentDate : asIsoDate(currentRep.repayment_date);
    const updatedNotes = result.data.notes !== undefined ? (result.data.notes?.trim() || null) : currentRep.notes;

    await tx`
      UPDATE wallet_loan_repayments
      SET amount_minor = ${updatedAmount},
          repayment_date = ${updatedDate},
          notes = ${updatedNotes}
      WHERE id = ${repaymentId} AND loan_id = ${loanId}
    `;

    return loadLoanRecord(tx, loanId);
  });

  return { status: 200, body: { loan } };
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
  try {
    await pruneExpiredBudgetNotifications(sql, userId);
  } catch (pruneErr) {
    console.warn("Failed to prune notifications, continuing:", pruneErr);
  }

  try {
    const rows = await sql`SELECT id, user_id, notification_type, title, message, notification_status, created_at, read_at, scheduled_for, metadata_json, dedupe_key FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC`;
    return { status: 200, body: { notifications: rows.map(mapNotification) } };
  } catch (err) {
    console.warn("Retrying notifications query without read_at:", err);
    const fallbackRows = await sql`SELECT id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC`;
    return { status: 200, body: { notifications: fallbackRows.map((r) => mapNotification({ ...r, read_at: null })) } };
  }
}

async function markNotificationReadForUser(userId, notificationId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`UPDATE notifications SET notification_status = ${"read"}, read_at = COALESCE(read_at, NOW()) WHERE id = ${notificationId} AND user_id = ${userId} RETURNING id, user_id, notification_type, title, message, notification_status, created_at, read_at, scheduled_for, metadata_json, dedupe_key`;
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
  await sql`UPDATE notifications SET notification_status = ${"read"}, read_at = COALESCE(read_at, NOW()) WHERE user_id = ${userId}`;
  return { status: 204, body: null };
}

async function getReminderPreferencesForUser(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  const rows = await sql`SELECT user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, default_currency, default_timezone, display_name, photo_url, updated_at FROM reminder_preferences WHERE user_id = ${userId}`;
  if (!rows[0]) {
    return { status: 200, body: { preferences: { daily_logging_enabled: true, daily_logging_hour: 20, budget_alerts_enabled: true, budget_alert_threshold: 80, default_currency: "USD", default_timezone: "UTC", display_name: null, photo_url: null, updated_at: new Date().toISOString() } } };
  }
  const row = rows[0];
  return { status: 200, body: { preferences: { daily_logging_enabled: row.daily_logging_enabled, daily_logging_hour: row.daily_logging_hour, budget_alerts_enabled: row.budget_alerts_enabled, budget_alert_threshold: row.budget_alert_threshold, default_currency: row.default_currency || "USD", default_timezone: row.default_timezone || "UTC", display_name: row.display_name || null, photo_url: row.photo_url || null, updated_at: asIsoTimestamp(row.updated_at) } } };
}

async function updateReminderPreferencesForUser(userId, rawBody) {
  const result = reminderPreferencesSchema.safeParse(rawBody);
  if (!result.success) {
    return { status: 400, body: { error: "Invalid reminder preferences payload.", details: result.error.flatten() } };
  }
  const sql = getSqlClient();
  await ensureSchema(sql);

  const defaultCurrency = result.data.defaultCurrency || "USD";
  const defaultTimezone = result.data.defaultTimezone || "UTC";
  const displayName = result.data.displayName !== undefined ? result.data.displayName : null;
  const photoUrl = result.data.photoUrl !== undefined ? result.data.photoUrl : null;

  if (displayName) {
    const usernameConflict = await sql`SELECT COUNT(*)::text AS count FROM reminder_preferences WHERE display_name = ${displayName} AND user_id != ${userId}`;
    if (Number(usernameConflict[0]?.count ?? "0") > 0) {
      return { status: 400, body: { error: "Username is already taken by another user." } };
    }
  }

  const rows = await sql`INSERT INTO reminder_preferences (user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, default_currency, default_timezone, display_name, photo_url, updated_at) VALUES (${userId}, ${result.data.dailyLoggingEnabled}, ${result.data.dailyLoggingHour}, ${result.data.budgetAlertsEnabled}, ${result.data.budgetAlertThreshold}, ${defaultCurrency}, ${defaultTimezone}, ${displayName}, ${photoUrl}, ${new Date().toISOString()}) ON CONFLICT (user_id) DO UPDATE SET daily_logging_enabled = EXCLUDED.daily_logging_enabled, daily_logging_hour = EXCLUDED.daily_logging_hour, budget_alerts_enabled = EXCLUDED.budget_alerts_enabled, budget_alert_threshold = EXCLUDED.budget_alert_threshold, default_currency = EXCLUDED.default_currency, default_timezone = EXCLUDED.default_timezone, display_name = EXCLUDED.display_name, photo_url = EXCLUDED.photo_url, updated_at = EXCLUDED.updated_at RETURNING user_id, daily_logging_enabled, daily_logging_hour, budget_alerts_enabled, budget_alert_threshold, default_currency, default_timezone, display_name, photo_url, updated_at`; const row = rows[0];
  return { status: 200, body: { preferences: { daily_logging_enabled: row.daily_logging_enabled, daily_logging_hour: row.daily_logging_hour, budget_alerts_enabled: row.budget_alerts_enabled, budget_alert_threshold: row.budget_alert_threshold, default_currency: row.default_currency || "USD", default_timezone: row.default_timezone || "UTC", display_name: row.display_name || null, photo_url: row.photo_url || null, updated_at: asIsoTimestamp(row.updated_at) } } };
}

async function upsertNotification(sql, input) {
  const rows = await sql`INSERT INTO notifications (id, user_id, notification_type, title, message, notification_status, scheduled_for, metadata_json, dedupe_key, created_at) VALUES (${randomUUID()}, ${input.userId}, ${input.type}, ${input.title}, ${input.message}, ${"unread"}, ${input.scheduledFor}, ${input.metadata ? JSON.stringify(input.metadata) : null}, ${input.dedupeKey}, ${new Date().toISOString()}) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id, user_id, notification_type, title, message, notification_status, created_at, scheduled_for, metadata_json, dedupe_key`;
  return rows[0] ? mapNotification(rows[0]) : null;
}

async function pruneExpiredBudgetNotifications(sql, userId = null, now = new Date()) {
  const readCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const unreadCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    if (userId) {
      await sql`
        DELETE FROM notifications
        WHERE user_id = ${userId}
          AND (
            (notification_status = 'read' AND COALESCE(read_at, created_at) < ${readCutoff})
            OR
            (notification_status = 'unread' AND created_at < ${unreadCutoff})
          )
      `;
      return;
    }

    await sql`
      DELETE FROM notifications
      WHERE (notification_status = 'read' AND COALESCE(read_at, created_at) < ${readCutoff})
         OR (notification_status = 'unread' AND created_at < ${unreadCutoff})
    `;
  } catch (err) {
    if (!isUndefinedColumnError(err, "read_at")) {
      console.warn("Notification pruning failed; skipping destructive fallback:", err);
      return;
    }

    console.warn("Retrying notification pruning without read_at:", err);
    try {
      if (userId) {
        await sql`
          DELETE FROM notifications
          WHERE user_id = ${userId}
            AND (
              (notification_status = 'read' AND created_at < ${readCutoff})
              OR
              (notification_status = 'unread' AND created_at < ${unreadCutoff})
            )
        `;
        return;
      }

      await sql`
        DELETE FROM notifications
        WHERE (notification_status = 'read' AND created_at < ${readCutoff})
           OR (notification_status = 'unread' AND created_at < ${unreadCutoff})
      `;
    } catch (fallbackErr) {
      console.warn("Notification pruning fallback failed:", fallbackErr);
    }
  }
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
  await pruneExpiredBudgetNotifications(sql, targetUserId ?? null, now);
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

    // Check overdue loans for this user as borrower
    const overdueLoans = await sql`
        SELECT l.id, l.amount_minor, l.due_date,
               COALESCE(SUM(r.amount_minor), 0)::text AS total_repaid_minor
        FROM wallet_loans l
        LEFT JOIN wallet_loan_repayments r ON r.loan_id = l.id
        LEFT JOIN wallet_members m ON m.id = l.borrower_member_id
        WHERE l.status = 'active'
          AND l.due_date IS NOT NULL
          AND l.due_date < ${currentDate}
          AND (m.user_id = ${userId} OR lower(l.borrower_email) IN (SELECT lower(email) FROM wallet_members WHERE user_id = ${userId} AND email IS NOT NULL))
        GROUP BY l.id
      `;

    for (const loan of overdueLoans) {
      const principal = Number(loan.amount_minor);
      const repaid = Number(loan.total_repaid_minor || "0");
      const remainingMinor = Math.max(0, principal - repaid);

      if (remainingMinor > 0) {
        const notif = await upsertNotification(sql, {
          userId,
          type: "loan-overdue",
          title: "Overdue Loan Payment Alert",
          message: `Your loan payment of ${formatMinorUnits(remainingMinor)} was due on ${loan.due_date}. Please settle the outstanding balance.`,
          scheduledFor: null,
          metadata: {
            loanId: loan.id,
            dueDate: loan.due_date,
            overdueAmount: formatMinorUnits(remainingMinor)
          },
          dedupeKey: `loan-overdue:${loan.id}:${loan.due_date}`
        });

        if (notif) {
          createdNotifications.push(notif);
        }
      }
    }
  }

  return { status: 200, body: { processed_user_count: users.length, created_notifications: createdNotifications } };
}

async function deleteUserData(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);
  await sql.begin(async (tx) => {
    const tableRows = await tx`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const tables = new Set(tableRows.map((row) => row.table_name));
    const hasTable = (tableName) => tables.has(tableName);
    const ownedWalletIds = hasTable("wallets")
      ? (await tx`SELECT id FROM wallets WHERE owner_user_id = ${userId}`).map((row) => row.id)
      : [];

    if (hasTable("idempotency_requests") && hasTable("expenses")) {
      await tx`
        DELETE FROM idempotency_requests
        WHERE idempotency_key LIKE ${`${userId}:%`}
           OR expense_id IN (
             SELECT id FROM expenses WHERE user_id = ${userId}
           )
      `;
    } else if (hasTable("idempotency_requests")) {
      await tx`DELETE FROM idempotency_requests WHERE idempotency_key LIKE ${`${userId}:%`}`;
    }

    if (hasTable("notifications")) {
      await tx`DELETE FROM notifications WHERE user_id = ${userId}`;
    }
    if (hasTable("reminder_preferences")) {
      await tx`DELETE FROM reminder_preferences WHERE user_id = ${userId}`;
    }
    if (hasTable("bill_reminders")) {
      await tx`DELETE FROM bill_reminders WHERE user_id = ${userId}`;
    }

    for (const walletId of ownedWalletIds) {
      if (hasTable("wallet_loan_repayments") && hasTable("wallet_loans")) {
        await tx`DELETE FROM wallet_loan_repayments WHERE loan_id IN (SELECT id FROM wallet_loans WHERE wallet_id = ${walletId})`;
      }
      if (hasTable("wallet_loans")) {
        await tx`DELETE FROM wallet_loans WHERE wallet_id = ${walletId}`;
      }
      if (hasTable("wallet_expense_splits") && hasTable("wallet_expenses")) {
        await tx`DELETE FROM wallet_expense_splits WHERE wallet_expense_id IN (SELECT id FROM wallet_expenses WHERE wallet_id = ${walletId})`;
      }
      if (hasTable("wallet_expenses")) {
        await tx`DELETE FROM wallet_expenses WHERE wallet_id = ${walletId}`;
      }
      if (hasTable("wallet_settlements")) {
        await tx`DELETE FROM wallet_settlements WHERE wallet_id = ${walletId}`;
      }
      if (hasTable("wallet_budgets")) {
        await tx`DELETE FROM wallet_budgets WHERE wallet_id = ${walletId}`;
      }
      if (hasTable("wallet_members")) {
        await tx`DELETE FROM wallet_members WHERE wallet_id = ${walletId}`;
      }
      if (hasTable("wallets")) {
        await tx`DELETE FROM wallets WHERE id = ${walletId}`;
      }
    }

    if (hasTable("wallet_members")) {
      await tx`
        UPDATE wallet_members
        SET user_id = ${null},
            email = ${null},
            invite_status = ${"declined"}
        WHERE user_id = ${userId}
      `;
    }

    if (hasTable("budgets")) {
      await tx`DELETE FROM budgets WHERE user_id = ${userId}`;
    }
    if (hasTable("expenses")) {
      await tx`DELETE FROM expenses WHERE user_id = ${userId}`;
    }
    if (hasTable("wallet_loan_repayments") && hasTable("wallet_loans")) {
      await tx`DELETE FROM wallet_loan_repayments WHERE loan_id IN (SELECT id FROM wallet_loans WHERE owner_user_id = ${userId})`;
    }
    if (hasTable("wallet_loans")) {
      await tx`DELETE FROM wallet_loans WHERE owner_user_id = ${userId}`;
    }
  });
}

module.exports = {
  AuthenticationError,
  AuthenticationConfigurationError,
  authenticateRequest,
  linkWalletInvitesForUser,
  listWalletsForUser,
  createWalletForUser,
  updateWalletForUser,
  getWalletForUser,
  getWalletExpensesForUser,
  deleteWalletForUser,
  leaveWalletForUser,
  createWalletBudgetForUser,
  updateWalletBudgetForUser,
  deleteWalletBudgetForUser,
  createWalletMemberForUser,
  removeWalletMemberForUser,
  respondToWalletInvite,
  createWalletExpenseForUser,
  updateWalletExpenseForUser,
  deleteWalletExpenseForUser,
  createWalletSettlementForUser,
  updateWalletSettlementForUser,
  deleteWalletSettlementForUser,
  createWalletLoanForUser,
  updateWalletLoanForUser,
  deleteWalletLoanForUser,
  createWalletLoanRepaymentForUser,
  updateWalletLoanRepaymentForUser,
  deleteWalletLoanRepaymentForUser,
  listLoansForUser,
  createStandaloneLoanForUser,
  updateStandaloneLoanForUser,
  deleteStandaloneLoanForUser,
  createStandaloneLoanRepaymentForUser,
  updateStandaloneLoanRepaymentForUser,
  deleteStandaloneLoanRepaymentForUser,
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
