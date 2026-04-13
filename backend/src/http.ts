import {
  createBillReminderSchema,
  createBudgetSchema,
  createExpenseSchema,
  createReminderPreferencesSchema,
  createSettlementSchema,
  createWalletExpenseSchema,
  walletInviteResponseSchema,
  createWalletMemberSchema,
  createWalletSchema,
  expensesQuerySchema
} from "./lib/validation.js";
import {
  BillReminderNotFoundError,
  BudgetNotFoundError,
  ExpenseNotFoundError,
  IdempotencyConflictError,
  NotificationNotFoundError,
  type ExpenseStore,
  WalletBudgetNotFoundError,
  WalletExpenseNotFoundError,
  WalletInviteNotFoundError,
  WalletNotFoundError,
  WalletSettlementNotFoundError,
  WalletValidationError
} from "./store/types.js";

export type HandlerResponse = {
  status: number;
  body: unknown;
};

export async function handleHealthcheck(): Promise<HandlerResponse> {
  return {
    status: 200,
    body: { ok: true }
  };
}

export async function handleListExpenses(rawQuery: unknown, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = expensesQuerySchema.safeParse(rawQuery);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid query parameters.",
        details: result.error.flatten()
      }
    };
  }

  const expenses = await store.listExpenses(userId, result.data);
  return {
    status: 200,
    body: { expenses }
  };
}

export async function handleCreateExpense(rawBody: unknown, idempotencyKey: string | undefined, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  if (!idempotencyKey) {
    return {
      status: 400,
      body: {
        error: "Idempotency-Key header is required."
      }
    };
  }

  const result = createExpenseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid expense payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const created = await store.createExpense(userId, result.data, idempotencyKey);
    return {
      status: created.created ? 201 : 200,
      body: created
    };
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return {
        status: 409,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to create expense." }
    };
  }
}

export async function handleListBudgets(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const budgets = await store.listBudgets(userId);
  return {
    status: 200,
    body: { budgets }
  };
}

export async function handleCreateBudget(rawBody: unknown, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBudgetSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid budget payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const budget = await store.createBudget(userId, result.data);
    return {
      status: 201,
      body: { budget }
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to create budget." }
    };
  }
}

export async function handleUpdateBudget(rawBody: unknown, budgetId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBudgetSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid budget payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const budget = await store.updateBudget(userId, budgetId, result.data);
    return {
      status: 200,
      body: { budget }
    };
  } catch (error) {
    if (error instanceof BudgetNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update budget." }
    };
  }
}

export async function handleDeleteBudget(budgetId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteBudget(userId, budgetId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof BudgetNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete budget." }
    };
  }
}

export async function handleUpdateExpense(rawBody: unknown, expenseId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createExpenseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid expense payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const expense = await store.updateExpense(userId, expenseId, result.data);
    return {
      status: 200,
      body: { expense }
    };
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update expense." }
    };
  }
}

export async function handleDeleteExpense(expenseId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteExpense(userId, expenseId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete expense." }
    };
  }
}

export async function handleDeleteAccount(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteUserData(userId);
    return {
      status: 204,
      body: null
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to delete account data." }
    };
  }
}

export async function handleListWallets(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  await store.linkWalletInvites(userId, { email: null, name: null });
  const wallets = await store.listWallets(userId);
  return {
    status: 200,
    body: { wallets }
  };
}

export async function handleListWalletsForUser(user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  await store.linkWalletInvites(user.id, { email: user.email ?? null, name: user.name ?? null });
  const wallets = await store.listWallets(user.id);
  return {
    status: 200,
    body: { wallets }
  };
}

export async function handleCreateWallet(rawBody: unknown, user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const walletDetail = await store.createWallet(user.id, { name: user.name ?? null, email: user.email ?? null }, result.data);
    return {
      status: 201,
      body: { wallet: walletDetail }
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to create wallet." }
    };
  }
}

export async function handleGetWallet(walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.getWallet(userId, walletId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to load wallet." }
    };
  }
}

export async function handleDeleteWallet(walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteWallet(userId, walletId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete wallet." }
    };
  }
}

export async function handleLeaveWallet(walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.leaveWallet(userId, walletId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to leave wallet." }
    };
  }
}

export async function handleCreateWalletBudget(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBudgetSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet budget payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletBudget(userId, walletId, result.data);
    return {
      status: 201,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to create wallet budget." }
    };
  }
}

export async function handleUpdateWalletBudget(rawBody: unknown, walletId: string, walletBudgetId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBudgetSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet budget payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.updateWalletBudget(userId, walletId, walletBudgetId, result.data);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletBudgetNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update wallet budget." }
    };
  }
}

export async function handleDeleteWalletBudget(walletId: string, walletBudgetId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.deleteWalletBudget(userId, walletId, walletBudgetId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletBudgetNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete wallet budget." }
    };
  }
}

export async function handleGetWalletForUser(walletId: string, user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.linkWalletInvites(user.id, { email: user.email ?? null, name: user.name ?? null });
    const wallet = await store.getWallet(user.id, walletId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to load wallet." }
    };
  }
}

export async function handleCreateWalletMember(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletMemberSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet member payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletMember(userId, walletId, result.data);
    return {
      status: 201,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to add wallet member." }
    };
  }
}

export async function handleLinkWalletInvites(user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const linkedCount = await store.linkWalletInvites(user.id, { email: user.email ?? null, name: user.name ?? null });
    return {
      status: 200,
      body: { linkedCount }
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to link wallet invites." }
    };
  }
}

export async function handleCreateWalletExpense(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletExpenseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet expense payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletExpense(userId, walletId, result.data);
    return {
      status: 201,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to create shared expense." }
    };
  }
}

export async function handleUpdateWalletExpense(rawBody: unknown, walletId: string, walletExpenseId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletExpenseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet expense payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.updateWalletExpense(userId, walletId, walletExpenseId, result.data);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletExpenseNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update shared expense." }
    };
  }
}

export async function handleDeleteWalletExpense(walletId: string, walletExpenseId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.deleteWalletExpense(userId, walletId, walletExpenseId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletExpenseNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete shared expense." }
    };
  }
}

export async function handleCreateWalletSettlement(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createSettlementSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid settlement payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletSettlement(userId, walletId, result.data);
    return {
      status: 201,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to record settlement." }
    };
  }
}

export async function handleUpdateWalletSettlement(rawBody: unknown, walletId: string, settlementId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createSettlementSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid settlement payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.updateWalletSettlement(userId, walletId, settlementId, result.data);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletSettlementNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update settlement." }
    };
  }
}

export async function handleDeleteWalletSettlement(walletId: string, settlementId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.deleteWalletSettlement(userId, walletId, settlementId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletSettlementNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete settlement." }
    };
  }
}

export async function handleListBillReminders(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const billReminders = await store.listBillReminders(userId);
  return {
    status: 200,
    body: { billReminders }
  };
}

export async function handleCreateBillReminder(rawBody: unknown, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBillReminderSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid bill reminder payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const billReminder = await store.createBillReminder(userId, result.data);
    return {
      status: 201,
      body: { billReminder }
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to create bill reminder." }
    };
  }
}

export async function handleUpdateBillReminder(rawBody: unknown, billReminderId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBillReminderSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid bill reminder payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const billReminder = await store.updateBillReminder(userId, billReminderId, result.data);
    return {
      status: 200,
      body: { billReminder }
    };
  } catch (error) {
    if (error instanceof BillReminderNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update bill reminder." }
    };
  }
}

export async function handleDeleteBillReminder(billReminderId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteBillReminder(userId, billReminderId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof BillReminderNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete bill reminder." }
    };
  }
}

export async function handleListNotifications(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const notifications = await store.listNotifications(userId);
  return {
    status: 200,
    body: { notifications }
  };
}

export async function handleListNotificationsForUser(user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  await store.linkWalletInvites(user.id, { email: user.email ?? null, name: user.name ?? null });
  const notifications = await store.listNotifications(user.id);
  return {
    status: 200,
    body: { notifications }
  };
}

export async function handleRespondToWalletInvite(rawBody: unknown, walletMemberId: string, user: { id: string; name?: string | null; email?: string | null }, store: ExpenseStore): Promise<HandlerResponse> {
  const result = walletInviteResponseSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet invite response payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    await store.respondToWalletInvite(user.id, { email: user.email ?? null, name: user.name ?? null }, walletMemberId, result.data.action);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof WalletInviteNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to respond to wallet invite." }
    };
  }
}

export async function handleMarkNotificationRead(notificationId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const notification = await store.markNotificationRead(userId, notificationId);
    return {
      status: 200,
      body: { notification }
    };
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to update notification." }
    };
  }
}

export async function handleMarkAllNotificationsRead(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.markAllNotificationsRead(userId);
    return {
      status: 204,
      body: null
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to update notifications." }
    };
  }
}

export async function handleDeleteNotification(notificationId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteNotification(userId, notificationId);
    return {
      status: 204,
      body: null
    };
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete notification." }
    };
  }
}

export async function handleGetReminderPreferences(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const preferences = await store.getReminderPreferences(userId);
  return {
    status: 200,
    body: { preferences }
  };
}

export async function handleUpsertReminderPreferences(rawBody: unknown, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createReminderPreferencesSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid reminder preferences payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const preferences = await store.upsertReminderPreferences(userId, result.data);
    return {
      status: 200,
      body: { preferences }
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to update reminder preferences." }
    };
  }
}

export async function handleRunNotificationChecks(userId: string | undefined, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const result = await store.runNotificationChecks(userId);
    return {
      status: 200,
      body: result
    };
  } catch {
    return {
      status: 500,
      body: { error: "Failed to run reminder checks." }
    };
  }
}