import postgres from "postgres";
import { searchExpensesSemantic } from "../src/mcp/semanticSearch.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    console.log("Running database semantic search test for query 'biscuit or cookies'...");
    const userResult = await sql`SELECT user_id FROM expenses LIMIT 1`;
    if (userResult.length === 0) {
      console.log("No expenses found in database to search.");
      await sql.end();
      return;
    }
    const userId = userResult[0].user_id;
    console.log(`Searching for user: ${userId}`);
    const results = await searchExpensesSemantic(sql, userId, "biscuit or cookies", 5);
    console.log("Found matches:", JSON.stringify(results, null, 2));
  } catch (err) {
    console.error("Database search failed:", err);
  } finally {
    await sql.end();
  }
}

main();
