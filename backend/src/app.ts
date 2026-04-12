import express from "express";
import { authenticateBearerToken, AuthenticationConfigurationError, AuthenticationError, deleteAuthenticatedUser } from "./auth.js";
import { handleCreateBudget, handleCreateExpense, handleDeleteAccount, handleDeleteBudget, handleDeleteExpense, handleHealthcheck, handleListBudgets, handleListExpenses, handleUpdateBudget, handleUpdateExpense } from "./http.js";
import type { ExpenseStore } from "./store/types.js";

type RequestAuthenticator = (authorizationHeader: string | undefined) => Promise<{ id: string }>;
type AccountDeleter = (userId: string) => Promise<void>;

export function createApp(store: ExpenseStore, authenticateRequest: RequestAuthenticator = authenticateBearerToken, deleteUserAccount: AccountDeleter = deleteAuthenticatedUser) {
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

  app.get("/api/budgets", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleListBudgets(user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load budgets."
    );
  });

  app.post("/api/budgets", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateBudget(request.body, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to create budget."
    );
  });

  app.put("/api/budgets/:budgetId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateBudget(request.body, request.params.budgetId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to update budget."
    );
  });

  app.delete("/api/budgets/:budgetId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteBudget(request.params.budgetId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete budget."
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
          await deleteUserAccount(user.id);
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete account data."
    );
  });

  return app;
}