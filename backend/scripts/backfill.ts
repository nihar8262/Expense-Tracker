import postgres from "postgres";
import { saveEmbedding } from "../src/mcp/embeddingsHelper.js";
import dotenv from "dotenv";

// Load environment variables from root directory
dotenv.config({ path: "../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("Starting embeddings backfill...");

  // Ensure pgvector and content_embeddings schema are created
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`
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
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS content_embeddings_owner_idx ON content_embeddings (owner_id, owner_type)`;
    console.log("Database schema verified.");
  } catch (err) {
    console.error("Failed to run schema migrations:", err);
    process.exit(1);
  }

  // 1. Fetch personal expenses
  const expenses = await sql`
    SELECT id, user_id, amount_minor, category, description, expense_date, platform
    FROM expenses
  `;
  console.log(`Fetched ${expenses.length} personal expenses.`);

  // 2. Fetch wallet expenses and resolve user_id via paid_by_member_id
  const walletExpenses = await sql`
    SELECT we.id, we.wallet_id, we.amount_minor, we.category, we.description, we.expense_date, we.platform, wm.user_id
    FROM wallet_expenses we
    INNER JOIN wallet_members wm ON wm.id = we.paid_by_member_id
  `;
  console.log(`Fetched ${walletExpenses.length} wallet expenses.`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  // Process personal expenses
  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i];
    try {
      const existing = await sql`
        SELECT id FROM content_embeddings
        WHERE owner_id = ${exp.id} AND owner_type = 'expense'
      `;

      if (existing.length > 0) {
        skipCount++;
        continue;
      }

      console.log(`[${i + 1}/${expenses.length}] Embedding personal expense ${exp.id}...`);
      await saveEmbedding(
        sql,
        exp.user_id,
        exp.id,
        "expense",
        exp.category,
        exp.description,
        Number(exp.amount_minor),
        exp.expense_date,
        exp.platform
      );
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`  Failed to process personal expense ${exp.id}:`, err);
      failCount++;
    }
  }

  // Process wallet expenses
  for (let i = 0; i < walletExpenses.length; i++) {
    const we = walletExpenses[i];
    try {
      const existing = await sql`
        SELECT id FROM content_embeddings
        WHERE owner_id = ${we.id} AND owner_type = 'wallet_expense'
      `;

      if (existing.length > 0) {
        skipCount++;
        continue;
      }

      console.log(`[${i + 1}/${walletExpenses.length}] Embedding wallet expense ${we.id}...`);
      await saveEmbedding(
        sql,
        we.user_id || "unknown",
        we.id,
        "wallet_expense",
        we.category,
        we.description,
        Number(we.amount_minor),
        we.expense_date,
        we.platform
      );
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`  Failed to process wallet expense ${we.id}:`, err);
      failCount++;
    }
  }

  console.log(`Backfill finished: ${successCount} saved, ${skipCount} skipped, ${failCount} failed.`);
  await sql.end();
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
