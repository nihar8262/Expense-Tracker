import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { User } from "firebase/auth";
import type { Budget, BudgetForm, Expense, ExpenseForm, ExpensesQuery, PaginatedExpenses, PersonalAggregation, Wallet, WalletLoan } from "../types";
import {
  createBudget as createServerBudget,
  createExpense as createServerExpense,
  deleteBudget as deleteServerBudget,
  deleteExpense as deleteServerExpense,
  listBudgets,
  listExpenses as listServerExpenses,
  listLoans,
  listWallets,
  updateBudget as updateServerBudget,
  updateExpense as updateServerExpense
} from "./api";
import { isAndroidApp } from "../utils/platform";

const DATABASE_NAME = "expense_tracker_device";
const DATABASE_VERSION = 1;
const ENABLED_KEY_PREFIX = "expense-tracker.android-local-storage";
const sqlite = new SQLiteConnection(CapacitorSQLite);

let databasePromise: Promise<SQLiteDBConnection> | null = null;

async function readSnapshot<T>(userId: string, dataset: string): Promise<T[] | null> {
  if (!isAndroidApp) return null;
  const database = await openDatabase();
  const result = await database.query(
    "SELECT payload_json FROM sync_snapshots WHERE user_id = ? AND dataset = ? LIMIT 1",
    [userId, dataset]
  );
  const payload = result.values?.[0]?.payload_json;
  if (typeof payload !== "string") return null;
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(userId: string, dataset: string, payload: T[]): Promise<void> {
  if (!isAndroidApp) return;
  const database = await openDatabase();
  await database.run(
    `INSERT INTO sync_snapshots (user_id, dataset, payload_json, item_count, synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, dataset) DO UPDATE SET
       payload_json = excluded.payload_json,
       item_count = excluded.item_count,
       synced_at = excluded.synced_at`,
    [userId, dataset, JSON.stringify(payload), payload.length, new Date().toISOString()]
  );
}

export function readLocalWalletMetadata(userId: string): Promise<Wallet[] | null> {
  return readSnapshot<Wallet>(userId, "wallets");
}

export function cacheLocalWalletMetadata(userId: string, wallets: Wallet[]): Promise<void> {
  return writeSnapshot(userId, "wallets", wallets);
}

export function readLocalLoans(userId: string): Promise<WalletLoan[] | null> {
  return readSnapshot<WalletLoan>(userId, "loans");
}

export function cacheLocalLoans(userId: string, loans: WalletLoan[]): Promise<void> {
  return writeSnapshot(userId, "loans", loans);
}

export type DeviceStorageStatus = {
  enabled: boolean;
  lastSyncedAt: string | null;
  expenseCount: number;
  budgetCount: number;
  walletCount: number;
  pendingChangeCount: number;
  lastSyncStatus: "success" | "failed" | null;
};

export type DeviceSyncHistoryEntry = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "failed" | "unconfirmed";
  uploadedCount: number;
  downloadedCount: number;
  message: string | null;
};

export type DeviceSyncStage = "preparing" | "uploading" | "downloading" | "saving" | "complete";

const emptyStatus: DeviceStorageStatus = {
  enabled: false,
  lastSyncedAt: null,
  expenseCount: 0,
  budgetCount: 0,
  walletCount: 0,
  pendingChangeCount: 0
  ,lastSyncStatus: null
};

function enabledKey(userId: string) {
  return `${ENABLED_KEY_PREFIX}.${userId}`;
}

async function openDatabase(): Promise<SQLiteDBConnection> {
  if (!isAndroidApp) {
    throw new Error("Local device storage is available only in the Android app.");
  }

  if (!databasePromise) {
    databasePromise = (async () => {
      const existing = await sqlite.isConnection(DATABASE_NAME, false);
      const database = existing.result
        ? await sqlite.retrieveConnection(DATABASE_NAME, false)
        : await sqlite.createConnection(DATABASE_NAME, false, "no-encryption", DATABASE_VERSION, false);

      await database.open();
      await database.execute(`
        CREATE TABLE IF NOT EXISTS sync_snapshots (
          user_id TEXT NOT NULL,
          dataset TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          item_count INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NOT NULL,
          PRIMARY KEY (user_id, dataset)
        );
        CREATE TABLE IF NOT EXISTS sync_metadata (
          user_id TEXT PRIMARY KEY NOT NULL,
          last_synced_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_history (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          uploaded_count INTEGER NOT NULL DEFAULT 0,
          downloaded_count INTEGER NOT NULL DEFAULT 0,
          message TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_history_user_started
          ON sync_history(user_id, started_at DESC);
        UPDATE sync_history
          SET status = 'unconfirmed', message = 'The server response was delayed. Sync again to verify the result.'
          WHERE status = 'failed' AND LOWER(COALESCE(message, '')) LIKE '%timeout%exceeded%';
        CREATE TABLE IF NOT EXISTS device_expenses (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          server_id TEXT,
          amount TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          expense_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          platform TEXT,
          bank_account_id TEXT,
          bank_name TEXT,
          sync_state TEXT NOT NULL DEFAULT 'synced',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_device_expenses_user_date
          ON device_expenses(user_id, expense_date DESC, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_device_expenses_sync_state
          ON device_expenses(user_id, sync_state);
        CREATE TABLE IF NOT EXISTS device_budgets (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          server_id TEXT,
          amount TEXT NOT NULL,
          scope TEXT NOT NULL,
          category TEXT,
          budget_month TEXT NOT NULL,
          created_at TEXT NOT NULL,
          sync_state TEXT NOT NULL DEFAULT 'synced',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_device_budgets_user_month
          ON device_budgets(user_id, budget_month DESC);
        CREATE INDEX IF NOT EXISTS idx_device_budgets_sync_state
          ON device_budgets(user_id, sync_state);
      `);
      return database;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function enableDeviceStorage(userId: string): Promise<DeviceStorageStatus> {
  await openDatabase();
  window.localStorage.setItem(enabledKey(userId), "true");
  return getDeviceStorageStatus(userId);
}

async function ensureDeviceStorage(userId: string) {
  const database = await openDatabase();
  window.localStorage.setItem(enabledKey(userId), "true");
  return database;
}

export async function getDeviceStorageStatus(userId: string): Promise<DeviceStorageStatus> {
  if (!isAndroidApp || window.localStorage.getItem(enabledKey(userId)) !== "true") {
    return emptyStatus;
  }

  const database = await openDatabase();
  const snapshotResult = await database.query(
    "SELECT dataset, item_count FROM sync_snapshots WHERE user_id = ?",
    [userId]
  );
  const metadataResult = await database.query(
    "SELECT last_synced_at FROM sync_metadata WHERE user_id = ? LIMIT 1",
    [userId]
  );

  const counts = new Map<string, number>();
  for (const row of snapshotResult.values ?? []) {
    counts.set(String(row.dataset), Number(row.item_count) || 0);
  }

  const expenseCountResult = await database.query(
    "SELECT COUNT(*) AS count FROM device_expenses WHERE user_id = ? AND sync_state != 'pending_delete'",
    [userId]
  );
  const budgetCountResult = await database.query(
    "SELECT COUNT(*) AS count FROM device_budgets WHERE user_id = ? AND sync_state != 'pending_delete'",
    [userId]
  );
  const pendingCountResult = await database.query(
    `SELECT
       (SELECT COUNT(*) FROM device_expenses WHERE user_id = ? AND sync_state != 'synced') +
       (SELECT COUNT(*) FROM device_budgets WHERE user_id = ? AND sync_state != 'synced') AS count`,
    [userId, userId]
  );
  const latestSyncResult = await database.query(
    "SELECT status FROM sync_history WHERE user_id = ? AND status != 'running' ORDER BY started_at DESC LIMIT 1",
    [userId]
  );

  return {
    enabled: true,
    lastSyncedAt: metadataResult.values?.[0]?.last_synced_at ?? null,
    expenseCount: Number(expenseCountResult.values?.[0]?.count) || counts.get("expenses") || 0,
    budgetCount: Number(budgetCountResult.values?.[0]?.count) || counts.get("budgets") || 0,
    walletCount: counts.get("wallets") ?? 0,
    pendingChangeCount: Number(pendingCountResult.values?.[0]?.count) || 0,
    lastSyncStatus: latestSyncResult.values?.[0]?.status === "success" ? "success" : latestSyncResult.values?.[0]?.status === "failed" ? "failed" : null
  };
}

export async function getDeviceSyncHistory(userId: string, limit = 5): Promise<DeviceSyncHistoryEntry[]> {
  if (!isAndroidApp) return [];
  const database = await openDatabase();
  const result = await database.query(
    `SELECT id, started_at, completed_at, status, uploaded_count, downloaded_count, message
     FROM sync_history WHERE user_id = ? ORDER BY started_at DESC LIMIT ?`,
    [userId, limit]
  );
  return (result.values ?? []).map((row) => ({
    id: String(row.id),
    startedAt: String(row.started_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    status: row.status === "success" ? "success" : row.status === "failed" ? "failed" : row.status === "unconfirmed" ? "unconfirmed" : "running",
    uploadedCount: Number(row.uploaded_count) || 0,
    downloadedCount: Number(row.downloaded_count) || 0,
    message: row.message == null ? null : String(row.message)
  }));
}

async function downloadAllExpenses(user: User) {
  const pageSize = 100;
  const expenses = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await listServerExpenses(user, { limit: pageSize, offset, sort: "date_desc" });
    expenses.push(...page.expenses);
    hasMore = page.has_more;
    offset += page.expenses.length;
    if (page.expenses.length === 0) break;
  }

  return expenses;
}

function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    amount: String(row.amount),
    category: String(row.category),
    description: String(row.description),
    date: String(row.expense_date),
    created_at: String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
    platform: row.platform == null ? null : String(row.platform),
    bank_account_id: row.bank_account_id == null ? null : String(row.bank_account_id),
    bank_name: row.bank_name == null ? null : String(row.bank_name)
  };
}

async function insertExpenseRow(
  database: SQLiteDBConnection,
  userId: string,
  expense: Expense,
  serverId: string | null,
  syncState: "synced" | "pending_create" | "pending_update" | "pending_delete",
  transaction = true
) {
  await database.run(
    `INSERT OR REPLACE INTO device_expenses
      (user_id, id, server_id, amount, category, description, expense_date, created_at, platform,
       bank_account_id, bank_name, sync_state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      expense.id,
      serverId,
      expense.amount,
      expense.category,
      expense.description,
      expense.date,
      expense.created_at,
      expense.platform ?? null,
      expense.bank_account_id ?? null,
      expense.bank_name ?? null,
      syncState,
      syncState === "synced" ? (expense.updated_at ?? expense.created_at) : new Date().toISOString()
    ],
    transaction
  );
}

async function hydrateLegacyExpenseSnapshot(database: SQLiteDBConnection, userId: string) {
  const countResult = await database.query("SELECT COUNT(*) AS count FROM device_expenses WHERE user_id = ?", [userId]);
  if ((Number(countResult.values?.[0]?.count) || 0) > 0) return;
  const snapshot = await database.query(
    "SELECT payload_json FROM sync_snapshots WHERE user_id = ? AND dataset = 'expenses' LIMIT 1",
    [userId]
  );
  const payload = snapshot.values?.[0]?.payload_json;
  if (typeof payload !== "string") return;
  try {
    const expenses = JSON.parse(payload) as Expense[];
    for (const expense of expenses) await insertExpenseRow(database, userId, expense, expense.id, "synced");
  } catch {
    // A malformed legacy snapshot should not prevent the local database from opening.
  }
}

export async function createLocalExpense(payload: ExpenseForm, user: User): Promise<Expense> {
  const database = await ensureDeviceStorage(user.uid);
  const now = new Date().toISOString();
  const expense: Expense = {
    id: `local-${crypto.randomUUID()}`,
    amount: Number(payload.amount).toFixed(2),
    category: payload.category.trim(),
    description: payload.description.trim(),
    date: payload.date,
    created_at: now,
    platform: payload.platform || null,
    bank_account_id: payload.bankAccountId || null,
    bank_name: payload.bankName || null
  };
  await insertExpenseRow(database, user.uid, expense, null, "pending_create");
  return expense;
}

export async function updateLocalExpense(expenseId: string, payload: ExpenseForm, user: User): Promise<void> {
  const database = await ensureDeviceStorage(user.uid);
  const existing = await database.query(
    "SELECT * FROM device_expenses WHERE user_id = ? AND id = ? LIMIT 1",
    [user.uid, expenseId]
  );
  const row = existing.values?.[0];
  if (!row) throw new Error("Expense was not found on this device.");
  const current = rowToExpense(row);
  const updated: Expense = {
    ...current,
    amount: Number(payload.amount).toFixed(2),
    category: payload.category.trim(),
    description: payload.description.trim(),
    date: payload.date,
    platform: payload.platform || null,
    bank_account_id: payload.bankAccountId || null,
    bank_name: payload.bankName || null
  };
  const nextState = row.sync_state === "pending_create" ? "pending_create" : "pending_update";
  await insertExpenseRow(database, user.uid, updated, row.server_id ? String(row.server_id) : null, nextState);
}

export async function deleteLocalExpense(expenseId: string, user: User): Promise<void> {
  const database = await ensureDeviceStorage(user.uid);
  const existing = await database.query(
    "SELECT server_id, sync_state FROM device_expenses WHERE user_id = ? AND id = ? LIMIT 1",
    [user.uid, expenseId]
  );
  const row = existing.values?.[0];
  if (!row) return;
  if (row.sync_state === "pending_create" || !row.server_id) {
    await database.run("DELETE FROM device_expenses WHERE user_id = ? AND id = ?", [user.uid, expenseId]);
  } else {
    await database.run(
      "UPDATE device_expenses SET sync_state = 'pending_delete', updated_at = ? WHERE user_id = ? AND id = ?",
      [new Date().toISOString(), user.uid, expenseId]
    );
  }
}

export async function listLocalExpenses(user: User, query: ExpensesQuery = {}): Promise<PaginatedExpenses> {
  const database = await ensureDeviceStorage(user.uid);
  await hydrateLegacyExpenseSnapshot(database, user.uid);
  const result = await database.query(
    "SELECT * FROM device_expenses WHERE user_id = ? AND sync_state != 'pending_delete'",
    [user.uid]
  );
  let expenses = (result.values ?? []).map(rowToExpense);
  if (query.category) expenses = expenses.filter((item) => item.category.toLowerCase() === query.category!.toLowerCase());
  if (query.platform) expenses = expenses.filter((item) => query.platform === "none" ? !item.platform : item.platform === query.platform);
  if (query.month) expenses = expenses.filter((item) => item.date.startsWith(query.month!));
  if (query.from_date) expenses = expenses.filter((item) => item.date >= query.from_date!);
  if (query.to_date) expenses = expenses.filter((item) => item.date <= query.to_date!);
  if (query.search) {
    const search = query.search.toLowerCase();
    expenses = expenses.filter((item) => item.description.toLowerCase().includes(search) || item.category.toLowerCase().includes(search));
  }
  const sort = query.sort ?? "date_desc";
  expenses.sort((left, right) => {
    if (sort === "amount_asc") return Number(left.amount) - Number(right.amount);
    if (sort === "amount_desc") return Number(right.amount) - Number(left.amount);
    if (sort === "date_asc") return left.date.localeCompare(right.date) || left.created_at.localeCompare(right.created_at);
    return right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at);
  });
  const total = expenses.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  return {
    expenses: expenses.slice(offset, offset + limit),
    total_count: total,
    limit,
    offset,
    has_more: offset + limit < total
  };
}

export async function getLocalPersonalAggregation(user: User): Promise<PersonalAggregation> {
  const page = await listLocalExpenses(user, { limit: Number.MAX_SAFE_INTEGER, sort: "date_desc" });
  const expenses = page.expenses;
  const monthly = new Map<string, { total: number; count: number }>();
  const categories = new Map<string, { total: number; count: number; platforms: Map<string, number> }>();
  const monthlyCategories = new Map<string, { month: string; category: string; total: number; count: number; platforms: Map<string, number> }>();
  const monthlyPlatforms = new Map<string, { month: string; platform: string; total: number; count: number }>();
  let total = 0;
  for (const expense of expenses) {
    const amount = Number(expense.amount);
    const month = expense.date.slice(0, 7);
    const platform = expense.platform || "others";
    total += amount;
    const monthlyEntry = monthly.get(month) ?? { total: 0, count: 0 };
    monthlyEntry.total += amount; monthlyEntry.count += 1; monthly.set(month, monthlyEntry);
    const category = categories.get(expense.category) ?? { total: 0, count: 0, platforms: new Map() };
    category.total += amount; category.count += 1;
    category.platforms.set(platform, (category.platforms.get(platform) ?? 0) + amount); categories.set(expense.category, category);
    const mcKey = `${month}\u0000${expense.category}`;
    const mc = monthlyCategories.get(mcKey) ?? { month, category: expense.category, total: 0, count: 0, platforms: new Map() };
    mc.total += amount; mc.count += 1; mc.platforms.set(platform, (mc.platforms.get(platform) ?? 0) + amount); monthlyCategories.set(mcKey, mc);
    const mpKey = `${month}\u0000${platform}`;
    const mp = monthlyPlatforms.get(mpKey) ?? { month, platform, total: 0, count: 0 };
    mp.total += amount; mp.count += 1; monthlyPlatforms.set(mpKey, mp);
  }
  const categoryTotals = [...categories.entries()].map(([category, value]) => ({
    category, total: value.total.toFixed(2), count: value.count,
    platforms: [...value.platforms.keys()],
    platform_shares: [...value.platforms.entries()].map(([platform, amount]) => ({ platform, total: amount.toFixed(2) }))
  })).sort((a, b) => Number(b.total) - Number(a.total));
  const platformTotals = new Map<string, number>();
  for (const value of monthlyPlatforms.values()) platformTotals.set(value.platform, (platformTotals.get(value.platform) ?? 0) + value.total);
  const topPlatformEntry = [...platformTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total_amount: total.toFixed(2),
    expense_count: expenses.length,
    monthly_totals: [...monthly.entries()].map(([month, value]) => ({ month, total: value.total.toFixed(2), count: value.count })),
    category_totals: categoryTotals,
    budget_totals: [],
    top_platform: topPlatformEntry ? { platform: topPlatformEntry[0], amount: topPlatformEntry[1], formattedAmount: topPlatformEntry[1].toFixed(2) } : null,
    latest_expense: expenses[0] ?? null,
    monthly_category_totals: [...monthlyCategories.values()].map((value) => ({
      month: value.month, category: value.category, total: value.total.toFixed(2), count: value.count,
      platforms: [...value.platforms.keys()],
      platform_shares: [...value.platforms.entries()].map(([platform, amount]) => ({ platform, total: amount.toFixed(2) }))
    })),
    monthly_platform_totals: [...monthlyPlatforms.values()].map((value) => ({ month: value.month, platform: value.platform, total: value.total.toFixed(2), count: value.count }))
  };
}

async function pushPendingExpenses(user: User, database: SQLiteDBConnection, remoteExpenses: Expense[]) {
  const remoteById = new Map(remoteExpenses.map((item) => [item.id, item]));
  const pending = await database.query(
    "SELECT * FROM device_expenses WHERE user_id = ? AND sync_state != 'synced' ORDER BY updated_at ASC",
    [user.uid]
  );
  for (const row of pending.values ?? []) {
    const expense = rowToExpense(row);
    const remote = row.server_id ? remoteById.get(String(row.server_id)) : undefined;
    if (remote?.updated_at && new Date(remote.updated_at).getTime() > new Date(String(row.updated_at)).getTime()) {
      await database.run("DELETE FROM device_expenses WHERE user_id = ? AND id = ?", [user.uid, expense.id]);
      continue;
    }
    const payload: ExpenseForm = {
      amount: expense.amount, category: expense.category, description: expense.description, date: expense.date,
      platform: expense.platform, bankAccountId: expense.bank_account_id, bankName: expense.bank_name
    };
    if (row.sync_state === "pending_create") {
      await createServerExpense(payload, `android-${expense.id}`, user);
    } else if (row.sync_state === "pending_update" && row.server_id) {
      await updateServerExpense(String(row.server_id), payload, user);
    } else if (row.sync_state === "pending_delete" && row.server_id) {
      await deleteServerExpense(String(row.server_id), user);
    }
    await database.run("DELETE FROM device_expenses WHERE user_id = ? AND id = ?", [user.uid, expense.id]);
  }
}

function rowToBudget(row: Record<string, unknown>): Budget {
  return {
    id: String(row.id),
    amount: String(row.amount),
    scope: row.scope === "category" ? "category" : "monthly",
    category: row.category == null ? null : String(row.category),
    month: String(row.budget_month),
    created_at: String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at)
  };
}

async function insertBudgetRow(
  database: SQLiteDBConnection,
  userId: string,
  budget: Budget,
  serverId: string | null,
  syncState: "synced" | "pending_create" | "pending_update" | "pending_delete",
  transaction = true
) {
  await database.run(
    `INSERT OR REPLACE INTO device_budgets
      (user_id, id, server_id, amount, scope, category, budget_month, created_at, sync_state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, budget.id, serverId, budget.amount, budget.scope, budget.category, budget.month,
      budget.created_at, syncState, syncState === "synced" ? (budget.updated_at ?? budget.created_at) : new Date().toISOString()],
    transaction
  );
}

async function hydrateLegacyBudgetSnapshot(database: SQLiteDBConnection, userId: string) {
  const countResult = await database.query("SELECT COUNT(*) AS count FROM device_budgets WHERE user_id = ?", [userId]);
  if ((Number(countResult.values?.[0]?.count) || 0) > 0) return;
  const snapshot = await database.query(
    "SELECT payload_json FROM sync_snapshots WHERE user_id = ? AND dataset = 'budgets' LIMIT 1",
    [userId]
  );
  const payload = snapshot.values?.[0]?.payload_json;
  if (typeof payload !== "string") return;
  try {
    for (const budget of JSON.parse(payload) as Budget[]) await insertBudgetRow(database, userId, budget, budget.id, "synced");
  } catch {
    // Ignore malformed data left by an older snapshot format.
  }
}

export async function listLocalBudgets(user: User): Promise<Budget[]> {
  const database = await ensureDeviceStorage(user.uid);
  await hydrateLegacyBudgetSnapshot(database, user.uid);
  const result = await database.query(
    "SELECT * FROM device_budgets WHERE user_id = ? AND sync_state != 'pending_delete' ORDER BY budget_month DESC, created_at DESC",
    [user.uid]
  );
  return (result.values ?? []).map(rowToBudget);
}

export type LocalBudgetAlert = {
  id: string;
  title: string;
  message: string;
};

export async function getLocalBudgetAlerts(user: User, thresholdPercent = 80): Promise<LocalBudgetAlert[]> {
  const database = await ensureDeviceStorage(user.uid);
  const budgets = await listLocalBudgets(user);
  const alerts: LocalBudgetAlert[] = [];

  for (const budget of budgets) {
    const parameters: Array<string> = [user.uid, `${budget.month}-01`, `${budget.month}-31`];
    let categoryClause = "";
    if (budget.scope === "category" && budget.category) {
      categoryClause = " AND LOWER(category) = LOWER(?)";
      parameters.push(budget.category);
    }
    const result = await database.query(
      `SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS spent
       FROM device_expenses
       WHERE user_id = ? AND sync_state != 'pending_delete'
         AND expense_date >= ? AND expense_date <= ?${categoryClause}`,
      parameters
    );
    const spent = Number(result.values?.[0]?.spent ?? 0);
    const limit = Number(budget.amount);
    if (!Number.isFinite(spent) || !Number.isFinite(limit) || spent <= 0 || limit <= 0) continue;

    const label = budget.scope === "category" && budget.category ? `${budget.category} budget` : "Monthly budget";
    if (spent > limit) {
      alerts.push({
        id: `local-budget-overspent:${budget.id}:${budget.month}:${Math.round(spent * 100)}`,
        title: `${label} exceeded`,
        message: `${spent.toFixed(2)} spent against a ${limit.toFixed(2)} budget for ${budget.month}.`
      });
    } else {
      const spentPercent = (spent / limit) * 100;
      const warningMilestones = [...new Set([thresholdPercent, 80, 90])]
        .filter((milestone) => milestone >= thresholdPercent && milestone < 100)
        .sort((left, right) => right - left);
      const reachedMilestone = warningMilestones.find((milestone) => spentPercent >= milestone);
      if (reachedMilestone === undefined) continue;
      alerts.push({
        id: `local-budget-threshold:${budget.id}:${budget.month}:${reachedMilestone}`,
        title: `${label} nearing limit`,
        message: `${spent.toFixed(2)} spent, reaching ${spentPercent.toFixed(0)}% of your ${limit.toFixed(2)} budget for ${budget.month}. Minimize non-essential spending to stay within your limit.`
      });
    }
  }

  return alerts;
}

export async function createLocalBudget(payload: BudgetForm, user: User): Promise<void> {
  const database = await ensureDeviceStorage(user.uid);
  const now = new Date().toISOString();
  await insertBudgetRow(database, user.uid, {
    id: `local-${crypto.randomUUID()}`,
    amount: Number(payload.amount).toFixed(2),
    scope: payload.scope,
    category: payload.scope === "category" ? payload.category : null,
    month: payload.month,
    created_at: now
  }, null, "pending_create");
}

export async function updateLocalBudget(budgetId: string, payload: BudgetForm, user: User): Promise<void> {
  const database = await ensureDeviceStorage(user.uid);
  const result = await database.query("SELECT * FROM device_budgets WHERE user_id = ? AND id = ? LIMIT 1", [user.uid, budgetId]);
  const row = result.values?.[0];
  if (!row) throw new Error("Budget was not found on this device.");
  const current = rowToBudget(row);
  await insertBudgetRow(database, user.uid, {
    ...current,
    amount: Number(payload.amount).toFixed(2),
    scope: payload.scope,
    category: payload.scope === "category" ? payload.category : null,
    month: payload.month
  }, row.server_id ? String(row.server_id) : null, row.sync_state === "pending_create" ? "pending_create" : "pending_update");
}

export async function deleteLocalBudget(budgetId: string, user: User): Promise<void> {
  const database = await ensureDeviceStorage(user.uid);
  const result = await database.query("SELECT server_id, sync_state FROM device_budgets WHERE user_id = ? AND id = ? LIMIT 1", [user.uid, budgetId]);
  const row = result.values?.[0];
  if (!row) return;
  if (row.sync_state === "pending_create" || !row.server_id) {
    await database.run("DELETE FROM device_budgets WHERE user_id = ? AND id = ?", [user.uid, budgetId]);
  } else {
    await database.run("UPDATE device_budgets SET sync_state = 'pending_delete', updated_at = ? WHERE user_id = ? AND id = ?",
      [new Date().toISOString(), user.uid, budgetId]);
  }
}

async function pushPendingBudgets(user: User, database: SQLiteDBConnection, remoteBudgets: Budget[]) {
  const remoteById = new Map(remoteBudgets.map((item) => [item.id, item]));
  const pending = await database.query(
    "SELECT * FROM device_budgets WHERE user_id = ? AND sync_state != 'synced' ORDER BY updated_at ASC",
    [user.uid]
  );
  for (const row of pending.values ?? []) {
    const budget = rowToBudget(row);
    const remote = row.server_id ? remoteById.get(String(row.server_id)) : undefined;
    if (remote?.updated_at && new Date(remote.updated_at).getTime() > new Date(String(row.updated_at)).getTime()) {
      await database.run("DELETE FROM device_budgets WHERE user_id = ? AND id = ?", [user.uid, budget.id]);
      continue;
    }
    const payload: BudgetForm = {
      amount: budget.amount,
      scope: budget.scope,
      category: budget.category ?? "",
      month: budget.month
    };
    if (row.sync_state === "pending_create") await createServerBudget(payload, user);
    else if (row.sync_state === "pending_update" && row.server_id) await updateServerBudget(String(row.server_id), payload, user);
    else if (row.sync_state === "pending_delete" && row.server_id) await deleteServerBudget(String(row.server_id), user);
    await database.run("DELETE FROM device_budgets WHERE user_id = ? AND id = ?", [user.uid, budget.id]);
  }
}

async function performServerDataSync(user: User, onStage?: (stage: DeviceSyncStage) => void): Promise<{ status: DeviceStorageStatus; uploadedCount: number; downloadedCount: number }> {
  if (window.localStorage.getItem(enabledKey(user.uid)) !== "true") {
    throw new Error("Enable local device storage before syncing.");
  }

  const database = await openDatabase();
  onStage?.("uploading");
  const pendingBefore = await database.query(
    `SELECT
       (SELECT COUNT(*) FROM device_expenses WHERE user_id = ? AND sync_state != 'synced') +
       (SELECT COUNT(*) FROM device_budgets WHERE user_id = ? AND sync_state != 'synced') AS count`,
    [user.uid, user.uid]
  );
  const uploadedCount = Number(pendingBefore.values?.[0]?.count) || 0;
  const [comparisonExpenses, comparisonBudgets] = await Promise.all([downloadAllExpenses(user), listBudgets(user)]);
  await pushPendingExpenses(user, database, comparisonExpenses);
  await pushPendingBudgets(user, database, comparisonBudgets);
  onStage?.("downloading");
  const existingLocalLoans = await readSnapshot<WalletLoan>(user.uid, "loans");
  const [expenses, budgets, wallets, remoteLoans] = await Promise.all([
    downloadAllExpenses(user),
    listBudgets(user),
    listWallets(user),
    listLoans(user)
  ]);
  const loans = existingLocalLoans
    ? [
        ...existingLocalLoans.filter((loan) => loan.is_owner !== false && !loan.borrower_email),
        ...remoteLoans.filter((loan) => loan.is_owner === false || Boolean(loan.borrower_email))
      ]
    : remoteLoans;
  const syncedAt = new Date().toISOString();
  const downloadedCount = expenses.length + budgets.length + wallets.length + loans.length;

  onStage?.("saving");
  await database.beginTransaction();
  try {
    for (const [dataset, payload] of Object.entries({ expenses, budgets, wallets, loans })) {
      await database.run(
        `INSERT INTO sync_snapshots (user_id, dataset, payload_json, item_count, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, dataset) DO UPDATE SET
           payload_json = excluded.payload_json,
           item_count = excluded.item_count,
           synced_at = excluded.synced_at`,
        [user.uid, dataset, JSON.stringify(payload), payload.length, syncedAt],
        false
      );
    }
    await database.run(
      "DELETE FROM device_expenses WHERE user_id = ? AND sync_state = 'synced'",
      [user.uid],
      false
    );
    await database.run(
      "DELETE FROM device_budgets WHERE user_id = ? AND sync_state = 'synced'",
      [user.uid],
      false
    );
    for (const expense of expenses) {
      await insertExpenseRow(database, user.uid, expense, expense.id, "synced", false);
    }
    for (const budget of budgets) {
      await insertBudgetRow(database, user.uid, budget, budget.id, "synced", false);
    }
    await database.run(
      `INSERT INTO sync_metadata (user_id, last_synced_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
      [user.uid, syncedAt],
      false
    );
    await database.commitTransaction();
  } catch (error) {
    await database.rollbackTransaction();
    throw error;
  }

  return { status: await getDeviceStorageStatus(user.uid), uploadedCount, downloadedCount };
}

export async function syncServerDataToDevice(
  user: User,
  onStage?: (stage: DeviceSyncStage) => void
): Promise<DeviceStorageStatus> {
  if (window.localStorage.getItem(enabledKey(user.uid)) !== "true") {
    throw new Error("Enable local device storage before syncing.");
  }
  const database = await openDatabase();
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  onStage?.("preparing");
  await database.run(
    "INSERT INTO sync_history (id, user_id, started_at, status) VALUES (?, ?, ?, 'running')",
    [id, user.uid, startedAt]
  );
  try {
    const result = await performServerDataSync(user, onStage);
    await database.run(
      `UPDATE sync_history SET completed_at = ?, status = 'success', uploaded_count = ?, downloaded_count = ?, message = ? WHERE id = ?`,
      [new Date().toISOString(), result.uploadedCount, result.downloadedCount, "Manual sync completed.", id]
    );
    onStage?.("complete");
    return { ...result.status, lastSyncStatus: "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual sync failed.";
    const timedOut = /timeout.*exceeded/i.test(message);
    await database.run(
      `UPDATE sync_history SET completed_at = ?, status = ?, message = ? WHERE id = ?`,
      [
        new Date().toISOString(),
        timedOut ? "unconfirmed" : "failed",
        timedOut ? "The server response was delayed. Sync again to verify the result." : message,
        id
      ]
    );
    throw new Error(timedOut ? "The server response was delayed. Tap Sync again to verify the completed changes." : message);
  }
}
