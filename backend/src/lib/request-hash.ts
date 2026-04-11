import { createHash } from "node:crypto";
import type { CreateExpenseInput } from "./validation.js";

export function createExpenseRequestHash(input: CreateExpenseInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        amount: input.amount,
        category: input.category.trim(),
        description: input.description.trim(),
        date: input.date
      })
    )
    .digest("hex");
}