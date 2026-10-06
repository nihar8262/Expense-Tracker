const { listExpenses, createExpense } = require("./personal-expenses");
const { listWalletsForUser, getWalletForUser, getWalletExpensesForUser } = require("./finance");
const { randomUUID } = require("node:crypto");
const { getSqlClient } = require("./db");

const tools = [
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
    handler: async (args, userId) => {
      const fromDate = args.startDate && /^\d{4}-\d{2}-\d{2}$/.test(args.startDate) ? args.startDate : undefined;
      const toDate = args.endDate && /^\d{4}-\d{2}-\d{2}$/.test(args.endDate) ? args.endDate : undefined;
      const category = typeof args.category === "string" && args.category.trim() ? args.category.trim() : undefined;
      const result = await listExpenses({
        category,
        from_date: fromDate,
        to_date: toDate,
        limit: 100
      }, userId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to list expenses.");
      }
      return { expenses: result.body.expenses || [] };
    }
  },
  {
    name: "get_expense_summary",
    description: "Retrieve aggregated personal spending statistics (total spent, category breakdown with percentages, count) for a given date range (startDate/endDate) and/or category. ALWAYS use this tool when the user asks for spending analysis, monthly overviews, category breakdowns, or advice on what categories to cut back on.",
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
    handler: async (args, userId) => {
      const fromDate = args.startDate && /^\d{4}-\d{2}-\d{2}$/.test(args.startDate) ? args.startDate : undefined;
      const toDate = args.endDate && /^\d{4}-\d{2}-\d{2}$/.test(args.endDate) ? args.endDate : undefined;
      const category = typeof args.category === "string" && args.category.trim() ? args.category.trim() : undefined;
      const result = await listExpenses({
        category,
        from_date: fromDate,
        to_date: toDate,
        limit: 100
      }, userId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to retrieve expenses for summary.");
      }
      const expenses = result.body.expenses || [];

      let totalCents = 0;
      const categoryBreakdown = {};

      for (const e of expenses) {
        const amountNum = parseFloat(e.amount);
        if (!isNaN(amountNum)) {
          totalCents += Math.round(amountNum * 100);
          const cat = e.category || "Uncategorized";
          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amountNum;
        }
      }

      const total = (totalCents / 100).toFixed(2);
      for (const cat in categoryBreakdown) {
        categoryBreakdown[cat] = categoryBreakdown[cat].toFixed(2);
      }

      const topCategories = Object.entries(categoryBreakdown)
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalCents > 0 ? ((parseFloat(amount) * 10000) / totalCents).toFixed(1) + "%" : "0%"
        }))
        .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

      return {
        total,
        count: expenses.length,
        categoryBreakdown,
        topCategories,
        period: {
          startDate: args.startDate || "all time",
          endDate: args.endDate || "present"
        }
      };
    }
  },
  {
    name: "list_budgets",
    description: "Retrieve all active personal budgets set by the user, including overall monthly budgets and category-specific budget limits. Always use this when the user asks about budgets, spending limits, or whether they are under or over budget.",
    parameters: {
      type: "object",
      properties: {}
    },
    handler: async (_args, userId) => {
      const { listBudgets } = require("./personal-budgets");
      const budgets = await listBudgets(userId);
      return {
        budgets: (budgets || []).map(b => ({
          id: b.id,
          amount: b.amount,
          scope: b.scope,
          category: b.category,
          month: b.month
        }))
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
    handler: async (args, userId) => {
      const result = await listWalletsForUser(userId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to list wallets.");
      }
      return { wallets: result.body.wallets || [] };
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
    handler: async (args, userId) => {
      const result = await getWalletForUser(userId, args.walletId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to get wallet details.");
      }
      const wDetail = result.body.wallet;
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
    handler: async (args, userId) => {
      const result = await getWalletExpensesForUser(userId, args.walletId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to retrieve wallet expenses.");
      }
      let expenses = result.body.expenses || [];
      if (args.category) {
        expenses = expenses.filter(e => e.category?.toLowerCase() === args.category.toLowerCase());
      }
      if (args.startDate) {
        expenses = expenses.filter(e => e.date >= args.startDate);
      }
      if (args.endDate) {
        expenses = expenses.filter(e => e.date <= args.endDate);
      }
      return { expenses };
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
    handler: async (args, userId) => {
      const result = await getWalletExpensesForUser(userId, args.walletId);
      if (result.status !== 200) {
        throw new Error(result.body?.error || "Failed to retrieve wallet expenses for summary.");
      }
      let expenses = result.body.expenses || [];
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
      const categoryBreakdown = {};
      const platformBreakdown = {};

      for (const e of expenses) {
        const amountNum = parseFloat(e.amount);
        if (!isNaN(amountNum)) {
          totalCents += Math.round(amountNum * 100);
          const cat = e.category || "Uncategorized";
          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amountNum;
          if (e.platform) {
            platformBreakdown[e.platform] = (platformBreakdown[e.platform] || 0) + amountNum;
          }
        }
      }

      const total = (totalCents / 100).toFixed(2);
      for (const cat in categoryBreakdown) {
        categoryBreakdown[cat] = categoryBreakdown[cat].toFixed(2);
      }
      for (const plat in platformBreakdown) {
        platformBreakdown[plat] = platformBreakdown[plat].toFixed(2);
      }

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
    handler: async (args, userId) => {
      const idempotencyKey = "assistant-" + randomUUID();
      const result = await createExpense({
        amount: args.amount,
        category: args.category,
        description: args.description,
        date: args.date,
        platform: args.platform
      }, idempotencyKey, userId);

      if (result.status !== 201 && result.status !== 200) {
        throw new Error(result.body?.error || "Failed to create expense.");
      }
      return {
        expense: result.body.expense,
        created: result.status === 201
      };
    }
  },
  {
    name: "search_expenses_semantic",
    description: "Search across user expenses semantically for specific individual items, purchases, or merchants (e.g., 'find my coffee purchases', 'where did I spend money on cabs', 'groceries at Costco'). DO NOT use this tool for monthly spending summaries, category totals, or general budgeting advice — use get_expense_summary or list_budgets instead.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query, e.g. 'cabs' or 'restaurants'."
        },
        limit: {
          type: "integer",
          description: "Optional maximum number of results to return (default 5)."
        }
      },
      required: ["query"]
    },
    handler: async (args, userId) => {
      const { searchExpensesSemantic } = require("./semantic-search");
      const sql = getSqlClient();
      const results = await searchExpensesSemantic(sql, userId, args.query, args.limit || 5);
      return { results };
    }
  }
];

function getTools(currencyCode = "INR", currencySymbol = "₹") {
  return tools.map(tool => {
    if (tool.name === "get_expense_summary") {
      return {
        ...tool,
        handler: async (args, userId) => {
          const res = await tool.handler(args, userId);
          return { currency: currencyCode, currencySymbol, ...res };
        }
      };
    }
    if (tool.name === "list_expenses") {
      return {
        ...tool,
        handler: async (args, userId) => {
          const res = await tool.handler(args, userId);
          return { currency: currencyCode, currencySymbol, ...res };
        }
      };
    }
    if (tool.name === "list_budgets") {
      return {
        ...tool,
        handler: async (args, userId) => {
          const res = await tool.handler(args, userId);
          return { currency: currencyCode, currencySymbol, ...res };
        }
      };
    }
    return tool;
  });
}

module.exports = { tools, getTools };
