import cors from "cors";
import express from "express";
import type { ExpenseDatabase } from "./db.js";
import { expensesQuerySchema, createExpenseSchema } from "./lib/validation.js";

export function createApp(database: ExpenseDatabase) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/expenses", (request, response) => {
    const result = expensesQuerySchema.safeParse(request.query);

    if (!result.success) {
      return response.status(400).json({
        error: "Invalid query parameters.",
        details: result.error.flatten()
      });
    }

    return response.json({ expenses: database.listExpenses(result.data) });
  });

  app.post("/expenses", (request, response) => {
    const idempotencyKey = request.header("Idempotency-Key")?.trim();

    if (!idempotencyKey) {
      return response.status(400).json({
        error: "Idempotency-Key header is required."
      });
    }

    const result = createExpenseSchema.safeParse(request.body);

    if (!result.success) {
      return response.status(400).json({
        error: "Invalid expense payload.",
        details: result.error.flatten()
      });
    }

    try {
      const created = database.createExpense(result.data, idempotencyKey);
      return response.status(created.created ? 201 : 200).json(created);
    } catch (error) {
      if (error instanceof Error && error.message.includes("different payload")) {
        return response.status(409).json({ error: error.message });
      }

      return response.status(500).json({
        error: "Failed to create expense."
      });
    }
  });

  return app;
}