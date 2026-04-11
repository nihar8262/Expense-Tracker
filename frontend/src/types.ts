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
export type ChartGranularity = "daily" | "monthly" | "quarterly" | "yearly";
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
