import { z } from "zod";
import { parseAmountToMinorUnits } from "./money.js";

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const createExpenseSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: error instanceof Error ? error.message : "Invalid amount."
      });
      return z.NEVER;
    }
  }),
  category: z.string().trim().min(1, "Category is required.").max(64, "Category is too long."),
  description: z.string().trim().min(1, "Description is required.").max(280, "Description is too long."),
  date: z.string().trim().refine(isValidIsoDate, "Date must be a valid YYYY-MM-DD value.")
});

export const expensesQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  sort: z.enum(["date_desc"]).optional()
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpensesQueryInput = z.infer<typeof expensesQuerySchema>;