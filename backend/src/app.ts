import express from "express";
import { authenticateBearerToken, type AuthenticatedUser, AuthenticationConfigurationError, AuthenticationError, deleteAuthenticatedUser } from "./auth.js";
import {
  handleCreateBillReminder,
  handleCreateBudget,
  handleCreateExpense,
  handleCreateWallet,
  handleCreateWalletBudget,
  handleCreateWalletExpense,
  handleCreateWalletMember,
  handleCreateWalletSettlement,
  handleDeleteAccount,
  handleDeleteBillReminder,
  handleDeleteBudget,
  handleDeleteExpense,
  handleDeleteNotification,
  handleDeleteWalletBudget,
  handleDeleteWallet,
  handleDeleteWalletExpense,
  handleDeleteWalletSettlement,
  handleGetReminderPreferences,
  handleGetWalletForUser,
  handleHealthcheck,
  handleLinkWalletInvites,
  handleListBillReminders,
  handleListBudgets,
  handleListExpenses,
  handleListNotificationsForUser,
  handleListWalletsForUser,
  handleLeaveWallet,
  handleMarkAllNotificationsRead,
  handleMarkNotificationRead,
  handleRespondToWalletInvite,
  handleRunNotificationChecks,
  handleUpdateBillReminder,
  handleUpdateBudget,
  handleUpdateExpense,
  handleUpdateWalletBudget,
  handleUpdateWalletExpense,
  handleUpdateWalletSettlement,
  handleUpsertReminderPreferences
} from "./http.js";
import type { ExpenseStore } from "./store/types.js";

type RequestAuthenticator = (authorizationHeader: string | undefined) => Promise<AuthenticatedUser>;
type AccountDeleter = (userId: string) => Promise<void>;

export function createApp(store: ExpenseStore, authenticateRequest: RequestAuthenticator = authenticateBearerToken, deleteUserAccount: AccountDeleter = deleteAuthenticatedUser) {
  const app = express();

  app.use(express.json());

  async function withAuthenticatedUser(
    request: express.Request,
    response: express.Response,
    onSuccess: (user: AuthenticatedUser) => Promise<express.Response | void>,
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

  app.get("/api/wallets", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleListWalletsForUser(user, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load wallets."
    );
  });

  app.post("/api/wallets", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateWallet(request.body, user, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to create wallet."
    );
  });

  app.get("/api/wallets/:walletId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleGetWalletForUser(request.params.walletId, user, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load wallet."
    );
  });

  app.delete("/api/wallets/:walletId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteWallet(request.params.walletId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete wallet."
    );
  });

  app.post("/api/wallets/:walletId/leave", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleLeaveWallet(request.params.walletId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to leave wallet."
    );
  });

  app.post("/api/wallets/link-invites", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleLinkWalletInvites(user, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to link wallet invites."
    );
  });

  app.post("/api/wallets/:walletId/members", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateWalletMember(request.body, request.params.walletId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to add wallet member."
    );
  });

  app.post("/api/wallets/:walletId/budgets", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateWalletBudget(request.body, request.params.walletId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to create wallet budget."
    );
  });

  app.post("/api/wallets/:walletId/expenses", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateWalletExpense(request.body, request.params.walletId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to create shared expense."
    );
  });

  app.put("/api/wallets/:walletId/expenses/:walletExpenseId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateWalletExpense(request.body, request.params.walletId, request.params.walletExpenseId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update shared expense."
    );
  });

  app.delete("/api/wallets/:walletId/expenses/:walletExpenseId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteWalletExpense(request.params.walletId, request.params.walletExpenseId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to delete shared expense."
    );
  });

  app.put("/api/wallets/:walletId/budgets/:walletBudgetId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateWalletBudget(request.body, request.params.walletId, request.params.walletBudgetId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update wallet budget."
    );
  });

  app.delete("/api/wallets/:walletId/budgets/:walletBudgetId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteWalletBudget(request.params.walletId, request.params.walletBudgetId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to delete wallet budget."
    );
  });

  app.post("/api/wallets/:walletId/settlements", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateWalletSettlement(request.body, request.params.walletId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to record settlement."
    );
  });

  app.put("/api/wallets/:walletId/settlements/:settlementId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateWalletSettlement(request.body, request.params.walletId, request.params.settlementId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update settlement."
    );
  });

  app.delete("/api/wallets/:walletId/settlements/:settlementId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteWalletSettlement(request.params.walletId, request.params.settlementId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to delete settlement."
    );
  });

  app.get("/api/notifications", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleListNotificationsForUser(user, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load notifications."
    );
  });

  app.post("/api/wallet-invites/:walletMemberId/respond", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleRespondToWalletInvite(request.body, request.params.walletMemberId, user, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to respond to wallet invite."
    );
  });

  app.patch("/api/notifications/:notificationId/read", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleMarkNotificationRead(request.params.notificationId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update notification."
    );
  });

  app.delete("/api/notifications/:notificationId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteNotification(request.params.notificationId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete notification."
    );
  });

  app.post("/api/notifications/read-all", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleMarkAllNotificationsRead(user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to update notifications."
    );
  });

  app.post("/api/notifications/run-checks", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleRunNotificationChecks(user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to run reminder checks."
    );
  });

  app.get("/api/reminder-preferences", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleGetReminderPreferences(user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load reminder preferences."
    );
  });

  app.put("/api/reminder-preferences", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpsertReminderPreferences(request.body, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update reminder preferences."
    );
  });

  app.get("/api/bill-reminders", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleListBillReminders(user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to load bill reminders."
    );
  });

  app.post("/api/bill-reminders", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleCreateBillReminder(request.body, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to create bill reminder."
    );
  });

  app.put("/api/bill-reminders/:billReminderId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleUpdateBillReminder(request.body, request.params.billReminderId, user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to update bill reminder."
    );
  });

  app.delete("/api/bill-reminders/:billReminderId", async (request, response) => {
    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleDeleteBillReminder(request.params.billReminderId, user.id, store);

        if (result.body === null) {
          return response.sendStatus(result.status);
        }

        return response.status(result.status).json(result.body);
      },
      "Failed to delete bill reminder."
    );
  });

  app.post("/api/internal/reminders/run", async (request, response) => {
    const schedulerSecret = process.env.SCHEDULER_SECRET?.trim();
    const providedSecret = request.header("X-Scheduler-Secret")?.trim();

    if (schedulerSecret && providedSecret === schedulerSecret) {
      const result = await handleRunNotificationChecks(undefined, store);
      return response.status(result.status).json(result.body);
    }

    return withAuthenticatedUser(
      request,
      response,
      async (user) => {
        const result = await handleRunNotificationChecks(user.id, store);
        return response.status(result.status).json(result.body);
      },
      "Failed to run reminder checks."
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