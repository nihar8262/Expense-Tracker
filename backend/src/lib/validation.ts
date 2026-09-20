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
  date: z.string().trim().refine(isValidIsoDate, "Date must be a valid YYYY-MM-DD value."),
  platform: z.string().trim().max(50, "Platform is too long.").nullable().optional()
});

export const expensesQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  platform: z.string().trim().max(50).optional(),
  month: z.string().trim().refine(isValidIsoMonth, "Month must be a valid YYYY-MM value.").optional(),
  from_date: z.string().trim().refine(isValidIsoDate, "From date must be a valid YYYY-MM-DD value.").optional(),
  to_date: z.string().trim().refine(isValidIsoDate, "To date must be a valid YYYY-MM-DD value.").optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["date_desc", "date_asc", "none"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
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
  currency: z.string().trim().max(10).default("INR"),
  pictureUrl: z.string().trim().max(1000000).optional().nullable(),
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
    splits: z.array(walletSplitSchema).min(1, "At least one split member is required."),
    platform: z.string().trim().max(50, "Platform is too long.").nullable().optional()
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
  budgetAlertThreshold: z.number().int().min(1).max(100),
  defaultCurrency: z.string().trim().min(1).max(10).optional(),
  defaultTimezone: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  photoUrl: z.string().trim().nullable().optional()
});

export const createWalletReminderPreferencesSchema = z.object({
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

export const createWalletLoanSchema = z
  .object({
    walletId: z.string().trim().optional(),
    borrowerMemberId: z.string().trim().optional(),
    borrowerName: z.string().trim().optional(),
    borrowerEmail: z
      .string()
      .trim()
      .email("Invalid email address.")
      .nullable()
      .optional()
      .or(z.literal("")),
    amount: z.union([z.string(), z.number()]).transform((value, context) => {
      try {
        return parseAmountToMinorUnits(value);
      } catch (error) {
        context.issues.push({
          code: z.ZodIssueCode.custom,
          input: value,
          message: error instanceof Error ? error.message : "Invalid loan amount."
        });
        return z.NEVER;
      }
    }),
    interestRate: z.union([z.string(), z.number()]).default(0).transform((value, context) => {
      const raw = typeof value === "number" ? value.toString() : String(value ?? "0").trim();
      if (raw === "" || raw === "0") return 0;
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        context.issues.push({
          code: z.ZodIssueCode.custom,
          input: value,
          message: "Interest rate must be a valid number with up to 2 decimal places."
        });
        return z.NEVER;
      }
      const basisPoints = Math.round(Number(raw) * 100);
      if (basisPoints < 0 || basisPoints > 100000) {
        context.issues.push({
          code: z.ZodIssueCode.custom,
          input: value,
          message: "Interest rate must be between 0% and 1000%."
        });
        return z.NEVER;
      }
      return basisPoints;
    }),
    interestType: z.enum(["percentage", "fixed", "none"]).default("percentage"),
    interestRatePeriod: z.enum(["monthly", "yearly", "one-time"]).default("monthly"),
    loanType: z.enum(["lent", "borrowed"]).default("lent"),
    lendingDate: z.string().trim().refine(isValidIsoDate, "Lending date must be a valid YYYY-MM-DD value."),
    dueDate: z.string().trim().refine(isValidIsoDate, "Due date must be a valid YYYY-MM-DD value.").nullable().optional(),
    interestStartDate: z.string().trim().refine(isValidIsoDate, "Interest start date must be a valid YYYY-MM-DD value.").nullable().optional(),
    notes: z.string().trim().max(280, "Notes is too long.").nullable().optional(),
    creatorName: z.string().trim().max(120).nullable().optional(),
    creatorEmail: z.string().trim().max(320).nullable().optional()
  })
  .superRefine((value, context) => {
    if (!value.borrowerMemberId && !value.borrowerName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["borrowerName"],
        message: "Borrower name or borrower member is required."
      });
    }
  });

export const updateWalletLoanSchema = z.object({
  borrowerMemberId: z.string().trim().optional(),
  borrowerName: z.string().trim().optional(),
  borrowerEmail: z
    .string()
    .trim()
    .email("Invalid email address.")
    .nullable()
    .optional()
    .or(z.literal("")),
  amount: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: error instanceof Error ? error.message : "Invalid loan amount."
      });
      return z.NEVER;
    }
  }),
  interestRate: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    const raw = typeof value === "number" ? value.toString() : String(value ?? "0").trim();
    if (raw === "" || raw === "0") return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: "Interest rate must be a valid number with up to 2 decimal places."
      });
      return z.NEVER;
    }
    return Math.round(Number(raw) * 100);
  }),
  interestType: z.enum(["percentage", "fixed", "none"]).optional(),
  interestRatePeriod: z.enum(["monthly", "yearly", "one-time"]).optional(),
  loanType: z.enum(["lent", "borrowed"]).optional(),
  lendingDate: z.string().trim().refine(isValidIsoDate, "Lending date must be a valid YYYY-MM-DD value.").optional(),
  dueDate: z.string().trim().refine(isValidIsoDate, "Due date must be a valid YYYY-MM-DD value.").nullable().optional(),
  interestStartDate: z.string().trim().refine(isValidIsoDate, "Interest start date must be a valid YYYY-MM-DD value.").nullable().optional(),
  notes: z.string().trim().max(280, "Notes is too long.").nullable().optional(),
  status: z.enum(["active", "settled", "cancelled"]).optional()
});

export const createWalletLoanRepaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: error instanceof Error ? error.message : "Invalid repayment amount."
      });
      return z.NEVER;
    }
  }),
  repaymentDate: z.string().trim().refine(isValidIsoDate, "Repayment date must be a valid YYYY-MM-DD value."),
  notes: z.string().trim().max(280, "Notes is too long.").nullable().optional()
});

export const updateWalletLoanRepaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional().transform((value, context) => {
    if (value === undefined) return undefined;
    try {
      return parseAmountToMinorUnits(value);
    } catch (error) {
      context.issues.push({
        code: z.ZodIssueCode.custom,
        input: value,
        message: error instanceof Error ? error.message : "Invalid repayment amount."
      });
      return z.NEVER;
    }
  }),
  repaymentDate: z.string().trim().refine(isValidIsoDate, "Repayment date must be a valid YYYY-MM-DD value.").optional(),
  notes: z.string().trim().max(280, "Notes is too long.").nullable().optional()
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
export type CreateWalletReminderPreferencesInput = z.infer<typeof createWalletReminderPreferencesSchema>;
export type CreateBillReminderInput = z.infer<typeof createBillReminderSchema>;
export type WalletInviteResponseInput = z.infer<typeof walletInviteResponseSchema>;
export type CreateWalletLoanInput = z.infer<typeof createWalletLoanSchema>;
export type UpdateWalletLoanInput = z.infer<typeof updateWalletLoanSchema>;
export type CreateWalletLoanRepaymentInput = z.infer<typeof createWalletLoanRepaymentSchema>;
export type UpdateWalletLoanRepaymentInput = z.infer<typeof updateWalletLoanRepaymentSchema>;