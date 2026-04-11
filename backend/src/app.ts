import express from "express";
import { authenticateBearerToken, AuthenticationConfigurationError, AuthenticationError } from "./auth.js";
import { handleCreateExpense, handleDeleteAccount, handleDeleteExpense, handleHealthcheck, handleListExpenses, handleUpdateExpense } from "./http.js";
import type { ExpenseStore } from "./store/types.js";

type RequestAuthenticator = (authorizationHeader: string | undefined) => Promise<{ id: string }>;

export function createApp(store: ExpenseStore, authenticateRequest: RequestAuthenticator = authenticateBearerToken) {
  const app = express();

  app.use(express.json());

  async function withAuthenticatedUser(
    request: express.Request,
    response: express.Response,
    onSuccess: (user: { id: string }) => Promise<express.Response | void>,
    fallbackMessage: string
  ) {
    try {
      const user = await authenticateRequest(request.header("Authorization")?.trim());
      return await onSuccess(user);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return response.status(401).json({ error: error.message });
      }

      if (error instanceof AuthenticationConfigurationError) {
        return response.status(500).json({ error: error.message });
      }

      console.error(fallbackMessage, error);
      return response.status(500).json({ error: fallbackMessage });
    }
  }

  app.get("/api/health", async (_request, response) => {
    const result = await handleHealthcheck();
    return response.status(result.status).json(result.body);
  });

  app.get("/api/expenses", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
      const result = await handleListExpenses(request.query, user.id, store);
      return response.status(result.status).json(result.body);
      },
      "Failed to load expenses."
    );
  });

  app.post("/api/expenses", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
      const result = await handleCreateExpense(request.body, request.header("Idempotency-Key")?.trim(), user.id, store);
      return response.status(result.status).json(result.body);
      },
      "Failed to create expense."
    );
  });

  app.put("/api/expenses/:expenseId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateExpense(request.body, request.params.expenseId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to update expense."
    );
  });

  app.delete("/api/expenses/:expenseId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteExpense(request.params.expenseId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete expense."
    );
  });

  app.delete("/api/account", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteAccount(user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete account data."
    );
  });

  return app;
}