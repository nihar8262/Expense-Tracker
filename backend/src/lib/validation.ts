import { z } from "zod";
import { parseAmountToMinorUnits } from "./money.js";

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidIsoMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month] = value.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

function parsePercentageToBasisPoints(value: string | number): number {
  const raw = typeof value === "number" ? value.toString() : String(value ?? "");
  const trimmed = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Percentage must be a valid number with up to 2 decimal places.");
  }

  const basisPoints = Math.round(Number(trimmed) * 100);

  if (!Number.isFinite(basisPoints) || basisPoints <= 0 || basisPoints > 10000) {
    throw new Error("Percentage must be greater than zero and at most 100.");
  }

  return basisPoints;
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

export const createBudgetSchema = z
  .object({
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
    scope: z.enum(["monthly", "category"]),
    category: z.string().trim().max(64, "Category is too long.").optional(),
    month: z.string().trim().refine(isValidIsoMonth, "Month must be a valid YYYY-MM value.")
  })
  .superRefine((value, context) => {
    if (value.scope === "category" && !value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Category is required for a category budget."
      });
    }

    if (value.scope === "monthly" && value.category?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Monthly budgets cannot target a specific category."
      });
    }
  });

export const createWalletSchema = z.object({
  name: z.string().trim().min(1, "Wallet name is required.").max(120, "Wallet name is too long."),
  description: z.string().trim().max(280, "Description is too long.").optional(),
  defaultSplitRule: z.enum(["equal", "fixed", "percentage"]).default("equal"),
  members: z
    .array(
      z.object({
        displayName: z.string().trim().min(1, "Member name is required.").max(120, "Member name is too long."),
        email: z.string().trim().max(160, "Email is too long.").optional()
      })
    )
    .max(15, "Wallets can have up to 15 additional members.")
    .default([])
});

export const createWalletMemberSchema = z.object({
  displayName: z.string().trim().min(1, "Member name is required.").max(120, "Member name is too long."),
  email: z.string().trim().max(160, "Email is too long.").optional()
});

const walletSplitSchema = z.object({
  memberId: z.string().trim().min(1, "Member ID is required."),
  value: z.union([z.string(), z.number()]).optional()
});

export const createWalletExpenseSchema = z
  .object({
    paidByMemberId: z.string().trim().min(1, "Payer is required."),
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
    date: z.string().trim().refine(isValidIsoDate, "Date must be a valid YYYY-MM-DD value."),
    splitRule: z.enum(["equal", "fixed", "percentage"]),
    splits: z.array(walletSplitSchema).min(1, "At least one split member is required.")
  })
  .transform((value, context) => {
    const normalizedSplits = value.splits.map((split, index) => {
      if (value.splitRule === "equal") {
        return {
          memberId: split.memberId,
          value: null
        };
      }

      if (split.value === undefined || split.value === null || String(split.value).trim() === "") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits", index, "value"],
          message: value.splitRule === "fixed" ? "A fixed amount is required for each split." : "A percentage is required for each split."
        });
        return z.NEVER;
      }

      try {
        return {
          memberId: split.memberId,
          value: value.splitRule === "fixed" ? parseAmountToMinorUnits(split.value) : parsePercentageToBasisPoints(split.value)
        };
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits", index, "value"],
          message: error instanceof Error ? error.message : "Invalid split value."
        });
        return z.NEVER;
      }
    });

    return {
      ...value,
      splits: normalizedSplits
    };
  })
  .superRefine((value, context) => {
    const memberIds = value.splits.map((split) => split.memberId);
    const uniqueMemberIds = new Set(memberIds);

    if (uniqueMemberIds.size !== memberIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splits"],
        message: "Each member can only appear once in a split."
      });
    }

    if (!uniqueMemberIds.has(value.paidByMemberId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paidByMemberId"],
        message: "The payer must be included in the split members."
      });
    }

    if (value.splitRule === "fixed") {
      const totalSplitAmount = value.splits.reduce((sum, split) => sum + (split.value ?? 0), 0);

      if (totalSplitAmount !== value.amount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits"],
          message: "Fixed split amounts must add up to the total expense amount."
        });
      }
    }

    if (value.splitRule === "percentage") {
      const totalBasisPoints = value.splits.reduce((sum, split) => sum + (split.value ?? 0), 0);

      if (totalBasisPoints !== 10000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits"],
          message: "Percentage splits must add up to 100%."
        });
      }
    }
  });

export const createSettlementSchema = z
  .object({
    fromMemberId: z.string().trim().min(1, "Paying member is required."),
    toMemberId: z.string().trim().min(1, "Receiving member is required."),
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
    date: z.string().trim().refine(isValidIsoDate, "Date must be a valid YYYY-MM-DD value."),
    note: z.string().trim().max(280, "Note is too long.").optional()
  })
  .superRefine((value, context) => {
    if (value.fromMemberId === value.toMemberId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toMemberId"],
        message: "Settlement participants must be different members."
      });
    }
  });

export const createReminderPreferencesSchema = z.object({
  dailyLoggingEnabled: z.boolean(),
  dailyLoggingHour: z.number().int().min(0).max(23),
  budgetAlertsEnabled: z.boolean(),
  budgetAlertThreshold: z.number().int().min(1).max(100)
});

export const createBillReminderSchema = z.object({
  title: z.string().trim().min(1, "Bill title is required.").max(120, "Bill title is too long."),
  amount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, context) => {
      if (value === undefined || value === null || String(value).trim() === "") {
        return null;
      }

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
  category: z.string().trim().max(64, "Category is too long.").optional(),
  dueDate: z.string().trim().refine(isValidIsoDate, "Due date must be a valid YYYY-MM-DD value."),
  recurrence: z.enum(["once", "weekly", "monthly", "yearly"]),
  intervalCount: z.number().int().min(1).max(24),
  reminderDaysBefore: z.number().int().min(0).max(60),
  isActive: z.boolean().default(true)
});

export const walletInviteResponseSchema = z.object({
  action: z.enum(["accept", "decline"])
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpensesQueryInput = z.infer<typeof expensesQuerySchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type CreateWalletMemberInput = z.infer<typeof createWalletMemberSchema>;
export type CreateWalletExpenseInput = z.infer<typeof createWalletExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type CreateReminderPreferencesInput = z.infer<typeof createReminderPreferencesSchema>;
export type CreateBillReminderInput = z.infer<typeof createBillReminderSchema>;
export type WalletInviteResponseInput = z.infer<typeof walletInviteResponseSchema>;