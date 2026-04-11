import { createExpenseSchema, expensesQuerySchema } from "./lib/validation.js";
import { IdempotencyConflictError, type ExpenseStore } from "./store/types.js";

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

export async function handleListExpenses(rawQuery: unknown, store: ExpenseStore): Promise<HandlerResponse> {
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

  const expenses = await store.listExpenses(result.data);
  return {
    status: 200,
    body: { expenses }
  };
}

export async function handleCreateExpense(rawBody: unknown, idempotencyKey: string | undefined, store: ExpenseStore): Promise<HandlerResponse> {
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
    const created = await store.createExpense(result.data, idempotencyKey);
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