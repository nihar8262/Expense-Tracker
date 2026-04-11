import { resolve } from "node:path";
import { initializeDatabase } from "./db.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4101);
const databasePath = resolve(process.cwd(), "data", "expenses.db");
const database = initializeDatabase(databasePath);
const app = createApp(database);

const server = app.listen(port, () => {
  console.log(`Expense API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);