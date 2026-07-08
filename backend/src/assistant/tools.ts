import type { ExpenseStore } from "../store/types.js";
import { randomUUID } from "node:crypto";
import { parseAmountToMinorUnits } from "../lib/money.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  handler: (args: any, userId: string) => Promise<any>;
}

export function getTools(store: ExpenseStore): ToolDefinition[] {
  return [
    {
      name: "list_expenses",
      description: "Retrieve a list of the user's personal expenses, optionally filtered by category and/or date range (startDate/endDate).",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Optional category to filter expenses by (e.g. 'Food', 'Travel')."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          }
        }
      },
      handler: async (args: any, userId: string) => {
        const expenses = await store.listExpenses(userId, { category: args.category });
        let filtered = expenses || [];
        if (args.startDate) {
          filtered = filtered.filter(e => e.date >= args.startDate);
        }
        if (args.endDate) {
          filtered = filtered.filter(e => e.date <= args.endDate);
        }
        return { expenses: filtered };
      }
    },
    {
      name: "get_expense_summary",
      description: "Retrieve aggregated personal spending statistics (total spent, category breakdown, count) for a given date range and/or category.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Optional category to filter summary by."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          }
        }
      },
      handler: async (args: any, userId: string) => {
        const expenses = await store.listExpenses(userId, { category: args.category });
        let filtered = expenses || [];
        if (args.startDate) {
          filtered = filtered.filter(e => e.date >= args.startDate);
        }
        if (args.endDate) {
          filtered = filtered.filter(e => e.date <= args.endDate);
        }

        let totalCents = 0;
        const categoryBreakdown: Record<string, string> = {};

        for (const e of filtered) {
          const amountNum = parseFloat(e.amount);
          if (!isNaN(amountNum)) {
            totalCents += Math.round(amountNum * 100);
            const cat = e.category || "Uncategorized";
            const currentCatTotal = parseFloat(categoryBreakdown[cat] || "0");
            categoryBreakdown[cat] = (currentCatTotal + amountNum).toFixed(2);
          }
        }

        const total = (totalCents / 100).toFixed(2);

        return {
          total,
          count: filtered.length,
          categoryBreakdown,
          period: {
            startDate: args.startDate || "all time",
            endDate: args.endDate || "present"
          }
        };
      }
    },
    {
      name: "list_wallets",
      description: "Retrieve a list of all shared wallets the user belongs to, including their basic details.",
      parameters: {
        type: "object",
        properties: {}
      },
      handler: async (args: any, userId: string) => {
        const wallets = await store.listWallets(userId);
        return { wallets: wallets || [] };
      }
    },
    {
      name: "get_wallet_balance",
      description: "Retrieve detailed balance information, recent expenses, and member balances for a specific shared wallet.",
      parameters: {
        type: "object",
        properties: {
          walletId: {
            type: "string",
            description: "The unique UUID of the shared wallet."
          }
        },
        required: ["walletId"]
      },
      handler: async (args: any, userId: string) => {
        const wDetail = await store.getWallet(userId, args.walletId);
        return {
          wallet: {
            id: wDetail.wallet.id,
            name: wDetail.wallet.name,
            description: wDetail.wallet.description,
            currency: wDetail.wallet.currency
          },
          balances: wDetail.balances || [],
          members: (wDetail.members || []).map(m => ({
            name: m.display_name,
            role: m.role,
            invite_status: m.invite_status
          })),
          recent_expenses: (wDetail.expenses || []).slice(0, 5).map(e => ({
            id: e.id,
            amount: e.amount,
            category: e.category,
            description: e.description,
            date: e.date,
            paid_by: e.paid_by_member_name
          }))
        };
      }
    },
    {
      name: "list_wallet_expenses",
      description: "Retrieve a list of expenses for a specific shared wallet, optionally filtered by category and/or date range (startDate/endDate).",
      parameters: {
        type: "object",
        properties: {
          walletId: {
            type: "string",
            description: "The unique UUID of the shared wallet."
          },
          category: {
            type: "string",
            description: "Optional category to filter expenses by."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          }
        },
        required: ["walletId"]
      },
      handler: async (args: any, userId: string) => {
        const wDetail = await store.getWallet(userId, args.walletId, {
          expenseLimit: 100,
          expenseOffset: 0,
          settlementLimit: 1,
          settlementOffset: 0
        });
        let expenses = wDetail.expenses || [];
        if (args.category) {
          expenses = expenses.filter(e => e.category?.toLowerCase() === args.category.toLowerCase());
        }
        if (args.startDate) {
          expenses = expenses.filter(e => e.date >= args.startDate);
        }
        if (args.endDate) {
          expenses = expenses.filter(e => e.date <= args.endDate);
        }
        return {
          expenses: expenses.map(e => ({
            id: e.id,
            amount: e.amount,
            category: e.category,
            description: e.description,
            date: e.date,
            paid_by: e.paid_by_member_name,
            platform: e.platform
          }))
        };
      }
    },
    {
      name: "get_wallet_expense_summary",
      description: "Retrieve aggregated spending statistics (total spent, category breakdown, count, platform spends) for a specific shared wallet, optionally filtered by date range and/or category.",
      parameters: {
        type: "object",
        properties: {
          walletId: {
            type: "string",
            description: "The unique UUID of the shared wallet."
          },
          category: {
            type: "string",
            description: "Optional category to filter summary by."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          }
        },
        required: ["walletId"]
      },
      handler: async (args: any, userId: string) => {
        const wDetail = await store.getWallet(userId, args.walletId, {
          expenseLimit: 100,
          expenseOffset: 0,
          settlementLimit: 1,
          settlementOffset: 0
        });
        let expenses = wDetail.expenses || [];
        if (args.category) {
          expenses = expenses.filter(e => e.category?.toLowerCase() === args.category.toLowerCase());
        }
        if (args.startDate) {
          expenses = expenses.filter(e => e.date >= args.startDate);
        }
        if (args.endDate) {
          expenses = expenses.filter(e => e.date <= args.endDate);
        }

        let totalCents = 0;
        const categoryBreakdown: Record<string, string> = {};
        const platformBreakdown: Record<string, string> = {};

        for (const e of expenses) {
          const amountNum = parseFloat(e.amount);
          if (!isNaN(amountNum)) {
            totalCents += Math.round(amountNum * 100);
            const cat = e.category || "Uncategorized";
            const currentCatTotal = parseFloat(categoryBreakdown[cat] || "0");
            categoryBreakdown[cat] = (currentCatTotal + amountNum).toFixed(2);

            if (e.platform) {
              const currentPlatTotal = parseFloat(platformBreakdown[e.platform] || "0");
              platformBreakdown[e.platform] = (currentPlatTotal + amountNum).toFixed(2);
            }
          }
        }

        const total = (totalCents / 100).toFixed(2);

        return {
          total,
          count: expenses.length,
          categoryBreakdown,
          platformBreakdown,
          period: {
            startDate: args.startDate || "all time",
            endDate: args.endDate || "present"
          }
        };
      }
    },
    {
      name: "create_expense",
      description: "Create a new personal expense. This is a write operation and requires confirmation.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "string",
            description: "The expense amount as a decimal string, e.g. '12.50'."
          },
          category: {
            type: "string",
            description: "The category of the expense, e.g. 'Food', 'Travel', 'Utilities'."
          },
          description: {
            type: "string",
            description: "A description of what the expense was for."
          },
          date: {
            type: "string",
            description: "The date of the expense in YYYY-MM-DD format."
          },
          platform: {
            type: "string",
            description: "Optional platform name (e.g. 'Uber', 'Amazon')."
          }
        },
        required: ["amount", "category", "description", "date"]
      },
      handler: async (args: any, userId: string) => {
        const idempotencyKey = "assistant-" + randomUUID();
        const amountMinor = parseAmountToMinorUnits(args.amount);
        const result = await store.createExpense(userId, {
          amount: amountMinor,
          category: args.category,
          description: args.description,
          date: args.date,
          platform: args.platform
        }, idempotencyKey);

        return {
          expense: result.expense,
          created: result.created
        };
      }
    }
  ];
}
