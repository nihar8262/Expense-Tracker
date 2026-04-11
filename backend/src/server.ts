import { createApp } from "./app.js";
import { createPostgresExpenseStore } from "./store/postgres.js";

const port = Number(process.env.PORT ?? 4101);
const store = createPostgresExpenseStore();
const app = createApp(store);

const server = app.listen(port, () => {
  console.log(`Expense API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);