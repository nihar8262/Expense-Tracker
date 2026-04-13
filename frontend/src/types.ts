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

export type WalletBudget = Budget & {
	wallet_id: string;
};

export type BudgetForm = {
	amount: string;
	scope: BudgetScope;
	category: string;
	month: string;
};

export type SplitRule = "equal" | "fixed" | "percentage";

export type Wallet = {
	id: string;
	name: string;
	description: string | null;
	default_split_rule: SplitRule;
	created_at: string;
};

export type WalletMember = {
	id: string;
	wallet_id: string;
	user_id: string | null;
	display_name: string;
	email: string | null;
	role: "owner" | "member";
	invite_status: "linked" | "pending" | "declined";
	joined_at: string;
};

export type WalletExpenseSplit = {
	member_id: string;
	member_name: string;
	amount: string;
	percentage: number | null;
};

export type WalletExpense = {
	id: string;
	wallet_id: string;
	paid_by_member_id: string;
	paid_by_member_name: string;
	amount: string;
	category: string;
	description: string;
	date: string;
	split_rule: SplitRule;
	created_at: string;
	splits: WalletExpenseSplit[];
};

export type WalletBalance = {
	member_id: string;
	member_name: string;
	net_amount: string;
};

export type WalletSettlement = {
	id: string;
	wallet_id: string;
	from_member_id: string;
	from_member_name: string;
	to_member_id: string;
	to_member_name: string;
	amount: string;
	date: string;
	note: string | null;
	created_at: string;
};

export type WalletDetail = {
	wallet: Wallet;
	members: WalletMember[];
	budgets: WalletBudget[];
	expenses: WalletExpense[];
	balances: WalletBalance[];
	settlements: WalletSettlement[];
};

export type Notification = {
	id: string;
	type: "budget-threshold" | "budget-overspent" | "daily-log" | "bill-due" | "wallet-invite" | "invite-response";
	title: string;
	message: string;
	status: "unread" | "read";
	created_at: string;
	scheduled_for: string | null;
	metadata: Record<string, string> | null;
};

export type BillReminderRecurrence = "once" | "weekly" | "monthly" | "yearly";

export type BillReminder = {
	id: string;
	user_id: string;
	title: string;
	amount: string | null;
	category: string | null;
	due_date: string;
	recurrence: BillReminderRecurrence;
	interval_count: number;
	reminder_days_before: number;
	is_active: boolean;
	created_at: string;
};

export type ReminderPreferences = {
	daily_logging_enabled: boolean;
	daily_logging_hour: number;
	budget_alerts_enabled: boolean;
	budget_alert_threshold: number;
	updated_at: string;
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

export type NotificationCenterProps = {
	notifications: Notification[];
	billReminders: BillReminder[];
	unreadCount: number;
	isOpen: boolean;
	isSavingPreferences: boolean;
	isSavingBillReminder: boolean;
	isRunningChecks: boolean;
	preferences: ReminderPreferences | null;
	notificationPanelRef: RefObject<HTMLDivElement | null>;
	onToggle: () => void;
	onMarkRead: (notificationId: string) => void;
	onMarkAllRead: () => void;
	onDeleteNotification: (notificationId: string) => Promise<boolean>;
	onRefreshChecks: () => void;
	onRespondToWalletInvite: (walletMemberId: string, action: "accept" | "decline") => Promise<boolean>;
	onSaveBillReminder: (input: {
		title: string;
		amount: string;
		category: string;
		dueDate: string;
		recurrence: BillReminderRecurrence;
		intervalCount: number;
		reminderDaysBefore: number;
		isActive: boolean;
	}, billReminderId?: string) => Promise<boolean>;
	onDeleteBillReminder: (billReminderId: string) => Promise<boolean>;
	onPreferencesChange: (field: "daily_logging_enabled" | "daily_logging_hour" | "budget_alerts_enabled" | "budget_alert_threshold", value: boolean | number) => void;
	onSavePreferences: () => void;
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
