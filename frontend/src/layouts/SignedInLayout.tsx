import type { ReactNode, RefObject } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "firebase/auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { NotificationCenter } from "../components/NotificationCenter";
import { ProfileMenu } from "../components/ProfileMenu";
import { BellIcon, cn } from "../components/ui";
import type { BillReminder, Notification, ReminderPreferences } from "../types";

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
  children: ReactNode;
};

const mainNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: false },
  { to: "/expenses", label: "Expenses", icon: false },
  { to: "/wallets", label: "Wallets", icon: false },
  { to: "/alerts", label: "Alerts", icon: false }
] as const;

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
  children
}: SignedInLayoutProps) {
  const handleNavClick = () => {
    onCloseProfileMenu();
    onCloseNotificationPanel();
  };

  return (
    <main className="app-page">
      <header className="surface-card sticky top-4 z-30 px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between gap-3 lg:gap-6">
          <div className="min-w-0">
            <p className="section-eyebrow">Personal finance</p>
            <NavLink to="/dashboard" className="block truncate font-display text-[2rem] leading-none tracking-[-0.04em] text-ink" onClick={handleNavClick}>
              Expense Tracker
            </NavLink>
          </div>

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
            <NavLink
              to="/alerts"
              onClick={handleNavClick}
              className={({ isActive }) => cn("relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/75 text-secondary shadow-sm backdrop-blur-sm hover:bg-white lg:hidden", isActive && "bg-white text-primary")}
              aria-label="Notifications"
            >
              <BellIcon className="h-5 w-5" />
              {unreadNotificationCount > 0 ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#d63b3b] ring-2 ring-white" aria-hidden="true" /> : null}
            </NavLink>

            <NotificationCenter
              notifications={notifications}
              billReminders={billReminders}
              unreadCount={unreadNotificationCount}
              isOpen={isNotificationPanelOpen}
              isSavingPreferences={isSavingReminderPreferences}
              isSavingBillReminder={isSavingBillReminder}
              isRunningChecks={isRunningNotificationChecks}
              preferences={reminderPreferences}
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
            />
          </div>
        </div>

      </header>

      <div className="mt-6 app-grid lg:mt-8">{children}</div>

      <nav className="fixed inset-x-4 bottom-4 z-30 rounded-[26px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(252,251,247,0.82))] p-2 shadow-[0_24px_80px_rgba(40,44,35,0.18)] backdrop-blur-xl lg:hidden" aria-label="Bottom navigation">
        <div className="grid grid-cols-4 gap-2">
          {mainNavItems.map((item) => (
            <NavLink
              key={`${item.to}-bottom`}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) => cn("relative mobile-tab-pill", isActive && "mobile-tab-pill-active")}
              aria-label={item.label}
            >
              {item.icon ? <BellIcon className="h-[18px] w-[18px]" /> : item.label}
              {item.to === "/alerts" && unreadNotificationCount > 0 ? <span className="absolute right-3 top-2.5 h-2.5 w-2.5 rounded-full bg-[#d63b3b] ring-2 ring-[rgba(255,255,255,0.85)]" aria-hidden="true" /> : null}
            </NavLink>
          ))}
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
    </main>
  );
}