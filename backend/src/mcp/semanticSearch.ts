import { getEmbedding } from "./geminiEmbeddings.js";
import type { Sql } from "postgres";

export async function searchExpensesSemantic(sql: Sql, userId: string, query: string, limit = 5): Promise<any[]> {
  try {
    const embedding = await getEmbedding(query);
    // Validate all values are safe finite floats before interpolating into SQL
    if (!Array.isArray(embedding) || !embedding.every((v: unknown) => typeof v === "number" && isFinite(v as number))) {
      throw new Error("Invalid embedding vector: contains non-numeric or non-finite values.");
    }
    const vectorStr = `[${embedding.join(",")}]`;

    const rows = await sql`
      SELECT owner_id, owner_type, content, (embedding <-> ${vectorStr}::vector(768)) AS distance
      FROM content_embeddings
      WHERE user_id = ${userId} AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    if (rows.length === 0) {
      return [];
    }

    const expenseIds = rows.filter(r => r.owner_type === "expense").map(r => r.owner_id);
    const walletExpenseIds = rows.filter(r => r.owner_type === "wallet_expense").map(r => r.owner_id);

    let personalExpenses: any[] = [];
    if (expenseIds.length > 0) {
      personalExpenses = await sql`
        SELECT id, amount_minor, category, description, expense_date, platform, created_at
        FROM expenses
        WHERE id IN ${sql(expenseIds)} AND user_id = ${userId}
      `;
    }

    let walletExpenses: any[] = [];
    if (walletExpenseIds.length > 0) {
      walletExpenses = await sql`
        SELECT wallet_expenses.id, wallet_expenses.wallet_id, wallets.name AS wallet_name,
               wallet_expenses.amount_minor, wallet_expenses.category, wallet_expenses.description,
               wallet_expenses.expense_date, wallet_expenses.platform, wallet_expenses.created_at
        FROM wallet_expenses
        INNER JOIN wallets ON wallets.id = wallet_expenses.wallet_id
        INNER JOIN wallet_members ON wallet_members.wallet_id = wallets.id
        WHERE wallet_expenses.id IN ${sql(walletExpenseIds)} AND wallet_members.user_id = ${userId}
      `;
    }

    const personalMap = new Map(personalExpenses.map(e => [e.id, e]));
    const walletMap = new Map(walletExpenses.map(e => [e.id, e]));

    const results: any[] = [];
    for (const row of rows) {
      if (row.owner_type === "expense") {
        const item = personalMap.get(row.owner_id);
        if (item) {
          results.push({
            type: "personal",
            id: item.id,
            amount: (Number(item.amount_minor) / 100).toFixed(2),
            category: item.category,
            description: item.description,
            date: item.expense_date,
            platform: item.platform,
            createdAt: item.created_at,
            similarityScore: (1 - Number(row.distance)).toFixed(4)
          });
        }
      } else if (row.owner_type === "wallet_expense") {
        const item = walletMap.get(row.owner_id);
        if (item) {
          results.push({
            type: "wallet",
            id: item.id,
            walletId: item.wallet_id,
            walletName: item.wallet_name,
            amount: (Number(item.amount_minor) / 100).toFixed(2),
            category: item.category,
            description: item.description,
            date: item.expense_date,
            platform: item.platform,
            createdAt: item.created_at,
            similarityScore: (1 - Number(row.distance)).toFixed(4)
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Semantic search failed:", error);
    throw error;
  }
}
