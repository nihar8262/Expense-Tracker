import type { AuthProvider, User } from "firebase/auth";
import type { RefObject } from "react";

export type Expense = {
	id: string;
	amount: string;
	category: string;
	description: string;
	date: string;
	created_at: string;
};

export type ExpenseForm = {
	amount: string;
	category: string;
	description: string;
	date: string;
};

export type BudgetScope = "monthly" | "category";

export type Budget = {
	id: string;
	amount: string;
	scope: BudgetScope;
	category: string | null;
	month: string;
	created_at: string;
};

export type BudgetForm = {
	amount: string;
	scope: BudgetScope;
	category: string;
	month: string;
};

export type BudgetHistoryRange = "quarter" | "half-year" | "year" | "all";

export type BudgetSummary = Budget & {
	spent: number;
	remaining: number;
	formattedAmount: string;
	formattedSpent: string;
	formattedRemaining: string;
	isOverspent: boolean;
};

export type BudgetHistoryGroup = {
	month: string;
	label: string;
	items: BudgetSummary[];
};

export type PendingSubmission = {
	idempotencyKey: string;
	payload: ExpenseForm;
	userId: string;
};

export type ProviderOption = {
	id: "google" | "github" | "facebook";
	label: string;
	blurb: string;
	provider: AuthProvider;
};

export type TimeRangeFilter = "all" | "week" | "month" | "year";
export type ChartGranularity = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type ChartDisplayType = "area" | "bar";
export type CategoryIconId = "groceries" | "food" | "travel" | "shopping" | "bills" | "health" | "entertainment" | "work" | "other";

export type TrendPoint = {
	key: string;
	label: string;
	shortLabel: string;
	total: number;
	count: number;
	order: number;
};

export type TrendDetailItem = {
	id: string;
	description: string;
	amount: string;
};

export type CategoryOption = {
	id: string;
	label: string;
	icon: CategoryIconId;
	isCustom?: boolean;
};

export type CategoryBreakdownItem = {
	category: string;
	amount: number;
	formattedAmount: string;
	share: number;
};

export type DashboardStats = {
	expenseCount: number;
	average: string;
	topCategory: CategoryBreakdownItem | null;
	latestExpense: Expense | null;
	categoryBreakdown: CategoryBreakdownItem[];
};

export type DashboardInsight = {
	id: string;
	title: string;
	body: string;
	tone: "positive" | "warning" | "neutral";
};

export type ChartSummaryPoint = TrendPoint & {
	x: number;
	y: number;
};

export type ChartSummary = {
	points: ChartSummaryPoint[];
	peakValue: number;
	linePath: string;
	areaPath: string;
};

export type ProfileMenuProps = {
	currentUser: User;
	isOpen: boolean;
	profileMenuRef: RefObject<HTMLDivElement | null>;
	onToggle: () => void;
	onSignOut: () => Promise<void>;
	onDeleteAccount: () => void;
	isDeletingAccount: boolean;
};

export class ApiError extends Error {
	status: number;
	retryable: boolean;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
		this.retryable = status >= 500;
	}
}
