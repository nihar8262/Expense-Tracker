const { getSqlClient } = require("./db");

let schemaReady;

async function ensureDeviceSyncSchema(sql = getSqlClient()) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS device_sync_changes (
          sequence BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          dataset VARCHAR(32) NOT NULL CHECK (dataset IN ('expenses', 'budgets')),
          record_id UUID NOT NULL,
          operation VARCHAR(16) NOT NULL CHECK (operation IN ('upsert', 'delete')),
          changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS device_sync_changes_user_sequence_idx ON device_sync_changes (user_id, sequence)`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
      await sql`UPDATE expenses SET updated_at = created_at WHERE updated_at IS NULL`;
      await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
      await sql`UPDATE budgets SET updated_at = created_at WHERE updated_at IS NULL`;
    })();
  }
  await schemaReady;
}

async function appendDeviceSyncChange(sql, userId, dataset, recordId, operation) {
  await ensureDeviceSyncSchema(sql);
  await sql`
    INSERT INTO device_sync_changes (user_id, dataset, record_id, operation, changed_at)
    VALUES (${userId}, ${dataset}, ${recordId}, ${operation}, NOW())
  `;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function amount(value) {
  const minor = Number(value);
  return `${minor < 0 ? "-" : ""}${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, "0")}`;
}

function mapExpense(row) {
  return {
    id: row.id,
    amount: amount(row.amount_minor),
    category: row.category,
    description: row.description,
    date: row.expense_date instanceof Date ? row.expense_date.toISOString().slice(0, 10) : row.expense_date,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at || row.created_at),
    platform: row.platform || null,
    bank_account_id: row.bank_account_id || null,
    bank_name: row.bank_name || null
  };
}

function mapBudget(row) {
  return {
    id: row.id,
    amount: amount(row.amount_minor),
    scope: row.budget_scope,
    category: row.category || null,
    month: row.budget_month,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at || row.created_at)
  };
}

async function getDeviceSyncPage(userId, rawCursor, rawLimit) {
  const sql = getSqlClient();
  await ensureDeviceSyncSchema(sql);
  const hasCursor = rawCursor !== undefined && rawCursor !== null && String(rawCursor).trim() !== "";
  const cursor = Math.max(0, Number.parseInt(String(rawCursor || "0"), 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(String(rawLimit || "200"), 10) || 200));

  if (!hasCursor) {
    const highWaterRows = await sql`SELECT COALESCE(MAX(sequence), 0)::bigint AS cursor FROM device_sync_changes WHERE user_id = ${userId}`;
    const highWater = String(highWaterRows[0]?.cursor || "0");
    const [expenses, budgets] = await Promise.all([
      sql`SELECT id, amount_minor, category, description, expense_date, created_at, updated_at, platform, bank_account_id, bank_name FROM expenses WHERE user_id = ${userId} ORDER BY created_at ASC`,
      sql`SELECT id, amount_minor, budget_scope, category, budget_month, created_at, updated_at FROM budgets WHERE user_id = ${userId} ORDER BY created_at ASC`
    ]);
    return {
      status: 200,
      body: { mode: "bootstrap", cursor: highWater, has_more: false, changes: [
        ...expenses.map((row) => ({ dataset: "expenses", operation: "upsert", record_id: row.id, record: mapExpense(row) })),
        ...budgets.map((row) => ({ dataset: "budgets", operation: "upsert", record_id: row.id, record: mapBudget(row) }))
      ] }
    };
  }

  const rows = await sql`
    SELECT sequence, dataset, record_id, operation, changed_at
    FROM device_sync_changes
    WHERE user_id = ${userId} AND sequence > ${cursor}
    ORDER BY sequence ASC
    LIMIT ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const changes = [];
  for (const change of page) {
    let record = null;
    if (change.operation === "upsert" && change.dataset === "expenses") {
      const found = await sql`SELECT id, amount_minor, category, description, expense_date, created_at, updated_at, platform, bank_account_id, bank_name FROM expenses WHERE user_id = ${userId} AND id = ${change.record_id}`;
      record = found[0] ? mapExpense(found[0]) : null;
    } else if (change.operation === "upsert" && change.dataset === "budgets") {
      const found = await sql`SELECT id, amount_minor, budget_scope, category, budget_month, created_at, updated_at FROM budgets WHERE user_id = ${userId} AND id = ${change.record_id}`;
      record = found[0] ? mapBudget(found[0]) : null;
    }
    changes.push({
      sequence: String(change.sequence), dataset: change.dataset,
      operation: record || change.operation === "delete" ? change.operation : "delete",
      record_id: change.record_id, changed_at: iso(change.changed_at), record
    });
  }
  return {
    status: 200,
    body: { mode: "incremental", cursor: page.length ? String(page[page.length - 1].sequence) : String(cursor), has_more: hasMore, changes }
  };
}

module.exports = { appendDeviceSyncChange, ensureDeviceSyncSchema, getDeviceSyncPage };
