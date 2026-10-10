import { useMemo, useState, type ReactNode, RefObject } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { NotificationCenter } from "../components/NotificationCenter";
import { ProfileMenu } from "../components/ProfileMenu";
import { AssistantPanel } from "../components/AssistantPanel";
import { cn } from "../components/ui";
import { LayoutDashboard, Receipt, ReceiptIndianRupee, Wallet as WalletIcon, Bell, Plus } from "lucide-react";
import type { BillReminder, Notification, ReminderPreferences, Wallet } from "../types";

type SignedInLayoutProps = {
  currentUser: User;
  isProfileMenuOpen: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  isNotificationPanelOpen: boolean;
  notificationPanelRef: RefObject<HTMLDivElement | null>;
  isDeleteAccountModalOpen: boolean;
  isDeletingAccount: boolean;
  notifications: Notification[];
  billReminders: BillReminder[];
  wallets: Wallet[];
  preferenceScope: string;
  onPreferenceScopeChange: (scope: string) => void;
  unreadNotificationCount: number;
  reminderPreferences: ReminderPreferences | null;
  isSavingReminderPreferences: boolean;
  isSavingBillReminder: boolean;
  isRunningNotificationChecks: boolean;
  onToggleProfileMenu: () => void;
  onCloseProfileMenu: () => void;
  onToggleNotificationPanel: () => void;
  onCloseNotificationPanel: () => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onDeleteNotification: (notificationId: string) => Promise<boolean>;
  onRunNotificationChecks: () => void;
  onRespondToWalletInvite: (walletMemberId: string, action: "accept" | "decline") => Promise<boolean>;
  onSaveBillReminder: (input: {
    title: string;
    amount: string;
    category: string;
    dueDate: string;
    recurrence: "once" | "weekly" | "monthly" | "yearly";
    intervalCount: number;
    reminderDaysBefore: number;
    isActive: boolean;
  }, billReminderId?: string) => Promise<boolean>;
  onDeleteBillReminder: (billReminderId: string) => Promise<boolean>;
  onReminderPreferencesChange: (field: "daily_logging_enabled" | "daily_logging_hour" | "budget_alerts_enabled" | "budget_alert_threshold", value: boolean | number) => void;
  onSaveReminderPreferences: () => void;
  onSignOut: () => Promise<void>;
  onOpenDeleteAccountModal: () => void;
  onCloseDeleteAccountModal: () => void;
  onDeleteAccount: () => Promise<void>;
  onOpenAddExpenseModal?: () => void;
  children: ReactNode;
};

export function SignedInLayout({
  currentUser,
  isProfileMenuOpen,
  profileMenuRef,
  isNotificationPanelOpen,
  notificationPanelRef,
  isDeleteAccountModalOpen,
  isDeletingAccount,
  notifications,
  billReminders,
  wallets,
  preferenceScope,
  onPreferenceScopeChange,
  unreadNotificationCount,
  reminderPreferences,
  isSavingReminderPreferences,
  isSavingBillReminder,
  isRunningNotificationChecks,
  onToggleProfileMenu,
  onCloseProfileMenu,
  onToggleNotificationPanel,
  onCloseNotificationPanel,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onRunNotificationChecks,
  onRespondToWalletInvite,
  onSaveBillReminder,
  onDeleteBillReminder,
  onReminderPreferencesChange,
  onSaveReminderPreferences,
  onSignOut,
  onOpenDeleteAccountModal,
  onCloseDeleteAccountModal,
  onDeleteAccount,
  onOpenAddExpenseModal,
  children
}: SignedInLayoutProps) {
  const location = useLocation();
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const isIndianRupee = (reminderPreferences?.default_currency || "INR").toUpperCase() === "INR";
  const ExpenseIcon = isIndianRupee ? ReceiptIndianRupee : Receipt;

  const mainNavItems = useMemo(
    () => [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/expenses", label: "Expenses", icon: ExpenseIcon },
      { to: "/wallets", label: "Wallets", icon: WalletIcon },
      { to: "/alerts", label: "Alerts", icon: Bell }
    ],
    [ExpenseIcon]
  );

  const handleNavClick = () => {
    onCloseProfileMenu();
    onCloseNotificationPanel();
    setIsAssistantOpen(false); // Auto-close assistant on navigation
  };

  return (
    <main className="app-page">
      <header className="surface-card sticky top-4 z-50 px-3 py-2.5 sm:px-5 sm:py-3 lg:px-6">
        <div className="flex items-center justify-between gap-2.5 sm:gap-3 lg:gap-6">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 sm:gap-3 group shrink-0"
            onClick={handleNavClick}
            aria-label="Expense Tracker"
          >
            <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-slate-200/80 shadow-xs transition-transform group-hover:scale-105">
              <img src="/expense-tracker.avif" alt="Expense Tracker Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="hidden sm:block section-eyebrow leading-tight">Personal finance</p>
              <span className="block truncate font-display text-[13.5px] sm:text-[1.65rem] lg:text-[1.85rem] font-bold sm:font-normal leading-tight sm:leading-none tracking-tight sm:tracking-[-0.03em] text-ink">
                Expense Tracker
              </span>
            </div>
          </NavLink>

          <nav className="hidden flex-1 items-center justify-center gap-2 lg:flex" aria-label="Primary navigation">
            {mainNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={({ isActive }) => cn("shell-nav-pill", isActive && "shell-nav-pill-active")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                onCloseProfileMenu();
                onCloseNotificationPanel();
                setIsAssistantOpen(!isAssistantOpen);
              }}
              className={cn(
                "relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/75 shadow-sm backdrop-blur-sm hover:bg-white lg:hidden overflow-hidden shrink-0 transition-all active:scale-95",
                isAssistantOpen && "bg-white ring-2 ring-primary"
              )}
              aria-label="Ask assistant"
            >
              <img src="/ai-chatbot.jpg" alt="AI Chatbot" className="h-full w-full object-cover" />
            </button>

            <NotificationCenter
              notifications={notifications}
              billReminders={billReminders}
              unreadCount={unreadNotificationCount}
              isOpen={isNotificationPanelOpen}
              isSavingPreferences={isSavingReminderPreferences}
              isSavingBillReminder={isSavingBillReminder}
              isRunningChecks={isRunningNotificationChecks}
              preferences={reminderPreferences}
              wallets={wallets}
              preferenceScope={preferenceScope}
              onPreferenceScopeChange={onPreferenceScopeChange}
              notificationPanelRef={notificationPanelRef}
              onToggle={onToggleNotificationPanel}
              onMarkRead={onMarkNotificationRead}
              onMarkAllRead={onMarkAllNotificationsRead}
              onDeleteNotification={onDeleteNotification}
              onRefreshChecks={onRunNotificationChecks}
              onRespondToWalletInvite={onRespondToWalletInvite}
              onSaveBillReminder={onSaveBillReminder}
              onDeleteBillReminder={onDeleteBillReminder}
              onPreferencesChange={onReminderPreferencesChange}
              onSavePreferences={onSaveReminderPreferences}
            />

            <ProfileMenu
              currentUser={currentUser}
              isOpen={isProfileMenuOpen}
              profileMenuRef={profileMenuRef}
              onToggle={onToggleProfileMenu}
              onSignOut={onSignOut}
              onDeleteAccount={onOpenDeleteAccountModal}
              isDeletingAccount={isDeletingAccount}
              photoUrl={reminderPreferences?.photo_url}
              displayName={reminderPreferences?.display_name}
            />
          </div>
        </div>

      </header>

      <div className="mt-6 app-grid pb-24 lg:mt-8 lg:pb-0">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t border-slate-200/85 dark:border-zinc-800 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,248,0.95))] dark:bg-[linear-gradient(180deg,rgba(18,24,20,0.98),rgba(14,18,15,0.95))] px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(20,40,25,0.08)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl lg:hidden"
        aria-label="Bottom navigation"
      >
        <div className="grid grid-cols-5 items-center">
          {/* Item 1: Dashboard */}
          <NavLink
            to="/dashboard"
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-1 transition-all duration-200 select-none group",
                isActive
                  ? "text-primary dark:text-emerald-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              )
            }
            aria-label="Dashboard"
          >
            <LayoutDashboard
              className={cn(
                "h-5 w-5 transition-transform duration-200 group-active:scale-95",
                (location.pathname === "/dashboard" || location.pathname === "/") && "scale-110 stroke-[2.3]"
              )}
            />
            <span
              className={cn(
                "truncate text-[10.5px] leading-tight transition-colors duration-200",
                (location.pathname === "/dashboard" || location.pathname === "/")
                  ? "font-bold text-primary dark:text-emerald-400"
                  : "font-medium"
              )}
            >
              Dashboard
            </span>
          </NavLink>

          {/* Item 2: Expenses */}
          <NavLink
            to="/expenses"
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-1 transition-all duration-200 select-none group",
                isActive
                  ? "text-primary dark:text-emerald-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              )
            }
            aria-label="Expenses"
          >
            <ExpenseIcon
              className={cn(
                "h-5 w-5 transition-transform duration-200 group-active:scale-95",
                location.pathname.startsWith("/expenses") && "scale-110 stroke-[2.3]"
              )}
            />
            <span
              className={cn(
                "truncate text-[10.5px] leading-tight transition-colors duration-200",
                location.pathname.startsWith("/expenses")
                  ? "font-bold text-primary dark:text-emerald-400"
                  : "font-medium"
              )}
            >
              Expenses
            </span>
          </NavLink>

          {/* Center Item: Elevated BHIM UPI-style Circular + Action Button */}
          <div className="flex flex-col items-center justify-center -mt-6 sm:-mt-7 relative">
            <button
              type="button"
              onClick={() => {
                onCloseProfileMenu();
                onCloseNotificationPanel();
                setIsAssistantOpen(false);
                onOpenAddExpenseModal?.();
              }}
              className="group relative flex items-center justify-center size-[52px] sm:size-[56px] rounded-full p-[3px] bg-gradient-to-tr from-[#1e7a53] via-[#22c55e] to-[#d4a857] shadow-[0_8px_22px_rgba(30,122,83,0.38)] active:scale-90 transition-all duration-200 ring-4 ring-white dark:ring-[#121814] cursor-pointer"
              aria-label="Add expense"
              title="Add expense"
            >
              <div className="size-full rounded-full bg-[#1e7a53] group-hover:bg-[#176343] flex items-center justify-center text-white transition-colors duration-200 shadow-inner">
                <Plus className="size-6 text-white stroke-[2.6] transition-transform duration-200 group-hover:rotate-90" />
              </div>
            </button>
          </div>

          {/* Item 4: Wallets */}
          <NavLink
            to="/wallets"
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-1 transition-all duration-200 select-none group",
                isActive
                  ? "text-primary dark:text-emerald-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              )
            }
            aria-label="Wallets"
          >
            <WalletIcon
              className={cn(
                "h-5 w-5 transition-transform duration-200 group-active:scale-95",
                location.pathname.startsWith("/wallets") && "scale-110 stroke-[2.3]"
              )}
            />
            <span
              className={cn(
                "truncate text-[10.5px] leading-tight transition-colors duration-200",
                location.pathname.startsWith("/wallets")
                  ? "font-bold text-primary dark:text-emerald-400"
                  : "font-medium"
              )}
            >
              Wallets
            </span>
          </NavLink>

          {/* Item 5: Alerts */}
          <NavLink
            to="/alerts"
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-1 transition-all duration-200 select-none group",
                isActive
                  ? "text-primary dark:text-emerald-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              )
            }
            aria-label="Alerts"
          >
            <div className="relative flex items-center justify-center">
              <Bell
                className={cn(
                  "h-5 w-5 transition-transform duration-200 group-active:scale-95",
                  location.pathname.startsWith("/alerts") && "scale-110 stroke-[2.3]"
                )}
              />
              {unreadNotificationCount > 0 && (
                <span
                  className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1 ring-2 ring-white dark:ring-[#121814]"
                  aria-hidden="true"
                >
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </div>
            <span
              className={cn(
                "truncate text-[10.5px] leading-tight transition-colors duration-200",
                location.pathname.startsWith("/alerts")
                  ? "font-bold text-primary dark:text-emerald-400"
                  : "font-medium"
              )}
            >
              Alerts
            </span>
          </NavLink>
        </div>
      </nav>

      <ConfirmModal
        isOpen={isDeleteAccountModalOpen}
        title="Delete your account?"
        description="This permanently removes your account, private expenses, budgets, and wallet-linked data that belongs to you. The action cannot be undone."
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        isConfirming={isDeletingAccount}
        onCancel={onCloseDeleteAccountModal}
        onConfirm={() => void onDeleteAccount()}
      />

      <AssistantPanel
        currentUser={currentUser}
        currency={reminderPreferences?.default_currency || "INR"}
        isOpen={isAssistantOpen}
        onToggle={() => setIsAssistantOpen(!isAssistantOpen)}
        onClose={() => setIsAssistantOpen(false)}
      />
    </main>
  );
}