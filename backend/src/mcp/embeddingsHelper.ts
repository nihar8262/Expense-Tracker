import { getEmbedding, calculateHash } from "./geminiEmbeddings.js";
import crypto from "node:crypto";
import type { Sql } from "postgres";

export async function saveEmbedding(
  sql: Sql,
  userId: string,
  ownerId: string,
  ownerType: "expense" | "wallet_expense",
  category: string,
  description: string,
  amountMinor: number,
  date: string,
  platform: string | null
): Promise<void> {
  let currency = "USD";
  try {
    if (ownerType === "wallet_expense") {
      const walletRows = await sql`
        SELECT wallets.currency
        FROM wallets
        INNER JOIN wallet_expenses ON wallet_expenses.wallet_id = wallets.id
        WHERE wallet_expenses.id = ${ownerId}
      `;
      if (walletRows[0] && walletRows[0].currency) {
        currency = walletRows[0].currency.toUpperCase();
      }
    } else {
      const prefRows = await sql`
        SELECT default_currency
        FROM reminder_preferences
        WHERE user_id = ${userId}
      `;
      if (prefRows[0] && prefRows[0].default_currency) {
        currency = prefRows[0].default_currency.toUpperCase();
      }
    }
  } catch (err) {
    console.error("Failed to query currency for embedding:", err);
  }

  const amountDecimal = (Number(amountMinor) / 100).toFixed(2);
  const platStr = platform ? `, Platform: ${platform}` : "";
  const content = `Amount: ${amountDecimal} ${currency}, Category: ${category}, Description: ${description}, Date: ${date}${platStr}`;
  const contentHash = calculateHash(content);

  let existing: any = null;
  try {
    const existingRows = await sql`
      SELECT id, content_hash, embedding_pending
      FROM content_embeddings
      WHERE owner_id = ${ownerId} AND owner_type = ${ownerType}
    `;
    existing = existingRows[0];
  } catch (err) {
    console.error("Failed to query existing embedding:", err);
  }

  if (existing && existing.content_hash === contentHash && !existing.embedding_pending) {
    return;
  }

  const id = existing ? existing.id : crypto.randomUUID();

  try {
    const embedding = await getEmbedding(content);
    // Validate all values are safe finite floats before interpolating into SQL
    if (!Array.isArray(embedding) || !embedding.every((v: unknown) => typeof v === "number" && isFinite(v as number))) {
      throw new Error("Invalid embedding vector: contains non-numeric or non-finite values.");
    }
    const vectorStr = `[${embedding.join(",")}]`;

    await sql`
      INSERT INTO content_embeddings (id, owner_type, owner_id, user_id, content, embedding, content_hash, created_at, embedding_pending)
      VALUES (${id}, ${ownerType}, ${ownerId}, ${userId}, ${content}, ${vectorStr}::vector(768), ${contentHash}, NOW(), FALSE)
      ON CONFLICT (owner_id, owner_type) DO UPDATE
      SET content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          content_hash = EXCLUDED.content_hash,
          embedding_pending = FALSE,
          created_at = NOW()
    `;
  } catch (error) {
    console.error("Failed to generate embedding, setting to pending:", error);
    await sql`
      INSERT INTO content_embeddings (id, owner_type, owner_id, user_id, content, embedding, content_hash, created_at, embedding_pending)
      VALUES (${id}, ${ownerType}, ${ownerId}, ${userId}, ${content}, NULL, ${contentHash}, NOW(), TRUE)
      ON CONFLICT (owner_id, owner_type) DO UPDATE
      SET content = EXCLUDED.content,
          embedding = NULL,
          content_hash = EXCLUDED.content_hash,
          embedding_pending = TRUE,
          created_at = NOW()
    `;
  }
}

export async function deleteEmbedding(sql: Sql, ownerId: string, ownerType: "expense" | "wallet_expense"): Promise<void> {
  try {
    await sql`
      DELETE FROM content_embeddings
      WHERE owner_id = ${ownerId} AND owner_type = ${ownerType}
    `;
  } catch (err) {
    console.error("Failed to delete embedding:", err);
  }
}
