import express from "express";
import { handleCreateExpense, handleHealthcheck, handleListExpenses } from "./http.js";
import type { ExpenseStore } from "./store/types.js";

export function createApp(store: ExpenseStore) {
  const app = express();

  app.use(express.json());

  app.get("/api/health", async (_request, response) => {
    const result = await handleHealthcheck();
    return response.status(result.status).json(result.body);
  });

  app.get("/api/expenses", async (request, response) => {
    const result = await handleListExpenses(request.query, store);
    return response.status(result.status).json(result.body);
  });

  app.post("/api/expenses", async (request, response) => {
    const result = await handleCreateExpense(request.body, request.header("Idempotency-Key")?.trim(), store);
    return response.status(result.status).json(result.body);
  });

  return app;
}