import {
  createBillReminderSchema,
  createBudgetSchema,
  createExpenseSchema,
  createReminderPreferencesSchema,
  createWalletReminderPreferencesSchema,
  createSettlementSchema,
  createWalletExpenseSchema,
  createWalletLoanSchema,
  updateWalletLoanSchema,
  createWalletLoanRepaymentSchema,
  updateWalletLoanRepaymentSchema,
  walletInviteResponseSchema,
  createWalletMemberSchema,
  createWalletSchema,
  expensesQuerySchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  createFeedbackSchema,
  updateFeedbackSchema
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
  WalletLoanNotFoundError,
  WalletSettlementNotFoundError,
  WalletValidationError,
  BankAccountNotFoundError,
  FeedbackLimitExceededError,
  FeedbackNotFoundError,
  FeedbackWindowExpiredError
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

  const paginatedResult = await store.listExpenses(userId, result.data);
  return {
    status: 200,
    body: {
      expenses: paginatedResult.expenses,
      total_count: paginatedResult.total_count,
      limit: paginatedResult.limit,
      offset: paginatedResult.offset,
      has_more: paginatedResult.has_more
    }
  };
}

export async function handleGetPersonalAggregation(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const aggregation = await store.getPersonalAggregation(userId);
  return {
    status: 200,
    body: aggregation
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

export async function handleUpdateWallet(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
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
    const walletDetail = await store.updateWallet(userId, walletId, result.data);
    return {
      status: 200,
      body: { wallet: walletDetail }
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
      body: { error: "Failed to update wallet." }
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

    console.error("deleteWallet error:", error);
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

export async function handleGetWalletForUser(
  walletId: string,
  user: { id: string; name?: string | null; email?: string | null },
  store: ExpenseStore,
  query?: any
): Promise<HandlerResponse> {
  try {
    const expenseLimit = query && query.expenseLimit ? parseInt(String(query.expenseLimit), 10) : undefined;
    const expenseOffset = query && query.expenseOffset ? parseInt(String(query.expenseOffset), 10) : undefined;
    const settlementLimit = query && query.settlementLimit ? parseInt(String(query.settlementLimit), 10) : undefined;
    const settlementOffset = query && query.settlementOffset ? parseInt(String(query.settlementOffset), 10) : undefined;

    const pagination = (expenseLimit !== undefined || expenseOffset !== undefined || settlementLimit !== undefined || settlementOffset !== undefined) ? {
      expenseLimit: !isNaN(expenseLimit!) ? expenseLimit! : 50,
      expenseOffset: !isNaN(expenseOffset!) ? expenseOffset! : 0,
      settlementLimit: !isNaN(settlementLimit!) ? settlementLimit! : 50,
      settlementOffset: !isNaN(settlementOffset!) ? settlementOffset! : 0
    } : undefined;

    const wallet = await store.getWallet(user.id, walletId, pagination);
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

export async function handleRemoveWalletMember(walletId: string, memberId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.removeWalletMember(userId, walletId, memberId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError) {
      return { status: 404, body: { error: error.message } };
    }
    if (error instanceof WalletValidationError) {
      return { status: 400, body: { error: error.message } };
    }
    return { status: 500, body: { error: "Failed to remove wallet member." } };
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

export async function handleCreateWalletLoan(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletLoanSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletLoan(userId, walletId, result.data);
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
      body: { error: "Failed to create loan." }
    };
  }
}

export async function handleUpdateWalletLoan(rawBody: unknown, walletId: string, loanId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = updateWalletLoanSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.updateWalletLoan(userId, walletId, loanId, result.data);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to update loan." }
    };
  }
}

export async function handleDeleteWalletLoan(walletId: string, loanId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.deleteWalletLoan(userId, walletId, loanId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to delete loan." }
    };
  }
}

export async function handleCreateWalletLoanRepayment(rawBody: unknown, walletId: string, loanId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletLoanRepaymentSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan repayment payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.createWalletLoanRepayment(userId, walletId, loanId, result.data);
    return {
      status: 201,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to record loan repayment." }
    };
  }
}

export async function handleUpdateWalletLoanRepayment(rawBody: unknown, walletId: string, loanId: string, repaymentId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = updateWalletLoanRepaymentSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan repayment payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const wallet = await store.updateWalletLoanRepayment(userId, walletId, loanId, repaymentId, result.data);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to update loan repayment." }
    };
  }
}

export async function handleDeleteWalletLoanRepayment(walletId: string, loanId: string, repaymentId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const wallet = await store.deleteWalletLoanRepayment(userId, walletId, loanId, repaymentId);
    return {
      status: 200,
      body: { wallet }
    };
  } catch (error) {
    if (error instanceof WalletNotFoundError || error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to delete loan repayment." }
    };
  }
}

export async function handleListLoans(userId: string, userEmail: string | null | undefined, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const loans = await store.listLoans(userId, userEmail);
    return {
      status: 200,
      body: { loans }
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: "Failed to list loans." }
    };
  }
}

export async function handleCreateStandaloneLoan(
  rawBody: unknown,
  userId: string,
  store: ExpenseStore,
  userName?: string | null,
  userEmail?: string | null
): Promise<HandlerResponse> {
  const result = createWalletLoanSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const payload = {
      ...result.data,
      creatorName: result.data.creatorName || userName || undefined,
      creatorEmail: result.data.creatorEmail || userEmail || undefined
    };
    const loan = await store.createStandaloneLoan(userId, payload);
    return {
      status: 201,
      body: { loan }
    };
  } catch (error) {
    if (error instanceof WalletValidationError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to create loan." }
    };
  }
}

export async function handleUpdateStandaloneLoan(rawBody: unknown, loanId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = updateWalletLoanSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const loan = await store.updateStandaloneLoan(userId, loanId, result.data);
    return {
      status: 200,
      body: { loan }
    };
  } catch (error) {
    if (error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to update loan." }
    };
  }
}

export async function handleDeleteStandaloneLoan(loanId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteStandaloneLoan(userId, loanId);
    return {
      status: 200,
      body: { ok: true }
    };
  } catch (error) {
    if (error instanceof WalletLoanNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete loan." }
    };
  }
}

export async function handleCreateStandaloneLoanRepayment(rawBody: unknown, loanId: string, userId: string, userEmail: string | null | undefined, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletLoanRepaymentSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan repayment payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const loan = await store.createStandaloneLoanRepayment(userId, loanId, result.data, userEmail);
    return {
      status: 201,
      body: { loan }
    };
  } catch (error) {
    if (error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to record loan repayment." }
    };
  }
}

export async function handleUpdateStandaloneLoanRepayment(rawBody: unknown, loanId: string, repaymentId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = updateWalletLoanRepaymentSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid loan repayment payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const loan = await store.updateStandaloneLoanRepayment(userId, loanId, repaymentId, result.data);
    return {
      status: 200,
      body: { loan }
    };
  } catch (error) {
    if (error instanceof WalletLoanNotFoundError) {
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
      body: { error: "Failed to update loan repayment." }
    };
  }
}

export async function handleDeleteStandaloneLoanRepayment(loanId: string, repaymentId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const loan = await store.deleteStandaloneLoanRepayment(userId, loanId, repaymentId);
    return {
      status: 200,
      body: { loan }
    };
  } catch (error) {
    if (error instanceof WalletLoanNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    return {
      status: 500,
      body: { error: "Failed to delete loan repayment." }
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

export async function handleRespondToWalletInvite(rawBody: unknown, walletMemberId: string, user: { id: string; name?: string | null; email?: string | null; emailVerified?: boolean }, store: ExpenseStore): Promise<HandlerResponse> {
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

  if (user.emailVerified === false) {
    return {
      status: 403,
      body: {
        error: "A verified email address is required to accept wallet invitations."
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

export async function handleGetWalletReminderPreferences(walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const preferences = await store.getWalletReminderPreferences(userId, walletId);
    return {
      status: 200,
      body: { preferences }
    };
  } catch (error) {
    if (error instanceof WalletValidationError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }
    return {
      status: 500,
      body: { error: "Failed to load wallet reminder preferences." }
    };
  }
}

export async function handleUpsertWalletReminderPreferences(rawBody: unknown, walletId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createWalletReminderPreferencesSchema.safeParse(rawBody);

  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid wallet reminder preferences payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const preferences = await store.upsertWalletReminderPreferences(userId, walletId, result.data);
    return {
      status: 200,
      body: { preferences }
    };
  } catch (error) {
    if (error instanceof WalletValidationError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }
    return {
      status: 500,
      body: { error: "Failed to update wallet reminder preferences." }
    };
  }
}

export async function handleListBankAccounts(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const bankAccounts = await store.listBankAccounts(userId);
    return {
      status: 200,
      body: { bankAccounts }
    };
  } catch (error) {
    console.error("Failed to list bank accounts:", error);
    return {
      status: 500,
      body: { error: "Failed to load bank accounts." }
    };
  }
}

export async function handleCreateBankAccount(rawBody: unknown, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createBankAccountSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid bank account payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const bankAccount = await store.createBankAccount(userId, result.data);
    return {
      status: 201,
      body: { bankAccount }
    };
  } catch (error) {
    console.error("Failed to create bank account:", error);
    return {
      status: 500,
      body: { error: "Failed to add bank account." }
    };
  }
}

export async function handleUpdateBankAccount(rawBody: unknown, bankAccountId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  const result = updateBankAccountSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid bank account update payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const bankAccount = await store.updateBankAccount(userId, bankAccountId, result.data);
    return {
      status: 200,
      body: { bankAccount }
    };
  } catch (error) {
    if (error instanceof BankAccountNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }
    console.error("Failed to update bank account:", error);
    return {
      status: 500,
      body: { error: "Failed to update bank account." }
    };
  }
}

export async function handleDeleteBankAccount(bankAccountId: string, userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    await store.deleteBankAccount(userId, bankAccountId);
    return {
      status: 200,
      body: { message: "Bank account removed successfully." }
    };
  } catch (error) {
    if (error instanceof BankAccountNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }
    console.error("Failed to delete bank account:", error);
    return {
      status: 500,
      body: { error: "Failed to delete bank account." }
    };
  }
}

export async function handleCreateFeedback(rawBody: unknown, userId: string, userEmail: string | null, store: ExpenseStore): Promise<HandlerResponse> {
  const result = createFeedbackSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid feedback payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const feedback = await store.createFeedback(userId, userEmail, result.data);

    let emailSent = false;
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (resendApiKey) {
      try {
        const rawRecipient = (process.env.EMAIL?.trim() || "niharnics").toLowerCase();
        const recipientEmail = rawRecipient.includes("@") ? rawRecipient : `${rawRecipient}@gmail.com`;
        const senderName = result.data.userName?.trim() || userEmail || "User";

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Expense Tracker Feedback <onboarding@resend.dev>",
            to: [recipientEmail],
            reply_to: userEmail || undefined,
            subject: `[Expense Tracker] New ${result.data.category.toUpperCase()} from ${senderName}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 20px;">New Feedback Received</h2>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 16px 0;">
                  <p style="margin: 0 0 10px;"><strong>Category:</strong> <span style="text-transform: capitalize; padding: 3px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-size: 13px; font-weight: 600;">${result.data.category}</span></p>
                  <p style="margin: 0 0 10px;"><strong>Submitted By:</strong> ${result.data.userName ? `${result.data.userName} (${userEmail || "No email"})` : (userEmail || "User")}</p>
                  ${result.data.rating ? `<p style="margin: 0 0 10px;"><strong>Rating:</strong> ${"⭐".repeat(result.data.rating)} (${result.data.rating}/5)</p>` : ""}
                  <p style="margin: 12px 0 6px;"><strong>Message:</strong></p>
                  <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; white-space: pre-wrap; font-size: 14px;">${result.data.message}</div>
                </div>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">This automated alert was dispatched by Expense Tracker via the Resend API.</p>
              </div>
            `
          })
        });

        if (response.ok) {
          emailSent = true;
        } else {
          const errText = await response.text();
          console.warn("Resend email delivery returned non-200:", errText);
        }
      } catch (err) {
        console.error("Failed to dispatch feedback email via Resend:", err);
      }
    }

    return {
      status: 201,
      body: { feedback, emailSent }
    };
  } catch (error) {
    if (error instanceof FeedbackLimitExceededError) {
      return {
        status: 429,
        body: { error: error.message }
      };
    }

    console.error("Failed to create feedback:", error);
    return {
      status: 500,
      body: { error: "Failed to record feedback." }
    };
  }
}

export async function handleListFeedbacks(userId: string, store: ExpenseStore): Promise<HandlerResponse> {
  try {
    const feedbacks = await store.listUserFeedbacks(userId);
    return {
      status: 200,
      body: { feedbacks }
    };
  } catch (error) {
    console.error("Failed to list feedbacks:", error);
    return {
      status: 500,
      body: { error: "Failed to list feedbacks." }
    };
  }
}

export async function handleUpdateFeedback(
  rawBody: unknown,
  feedbackId: string,
  userId: string,
  store: ExpenseStore
): Promise<HandlerResponse> {
  const result = updateFeedbackSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: {
        error: "Invalid feedback payload.",
        details: result.error.flatten()
      }
    };
  }

  try {
    const feedback = await store.updateFeedback(userId, feedbackId, result.data);
    return {
      status: 200,
      body: { feedback }
    };
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    if (error instanceof FeedbackWindowExpiredError) {
      return {
        status: 400,
        body: { error: error.message }
      };
    }

    console.error("Failed to update feedback:", error);
    return {
      status: 500,
      body: { error: "Failed to update feedback." }
    };
  }
}

export async function handleDeleteFeedback(
  feedbackId: string,
  userId: string,
  store: ExpenseStore
): Promise<HandlerResponse> {
  try {
    await store.deleteFeedback(userId, feedbackId);
    return {
      status: 200,
      body: { message: "Feedback deleted successfully." }
    };
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      return {
        status: 404,
        body: { error: error.message }
      };
    }

    console.error("Failed to delete feedback:", error);
    return {
      status: 500,
      body: { error: "Failed to delete feedback." }
    };
  }
}

