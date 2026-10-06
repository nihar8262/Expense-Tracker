import { useState, type ReactNode, RefObject } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { NotificationCenter } from "../components/NotificationCenter";
import { ProfileMenu } from "../components/ProfileMenu";
import { AssistantPanel } from "../components/AssistantPanel";
import { cn } from "../components/ui";
import { LayoutDashboard, Receipt, Wallet as WalletIcon, Bell } from "lucide-react";
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
  children: ReactNode;
};

const mainNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/wallets", label: "Wallets", icon: WalletIcon },
  { to: "/alerts", label: "Alerts", icon: Bell }
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
  children
}: SignedInLayoutProps) {
  const location = useLocation();
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const activeIndex = mainNavItems.findIndex((item) => {
    if (item.to === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/";
    }
    return location.pathname.startsWith(item.to);
  });
  const validActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  const handleNavClick = () => {
    onCloseProfileMenu();
    onCloseNotificationPanel();
    setIsAssistantOpen(false); // Auto-close assistant on navigation
  };

  return (
    <main className="app-page">
      <header className="surface-card sticky top-4 z-50 px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between gap-3 lg:gap-6">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2.5 sm:gap-3 group shrink-0"
            onClick={handleNavClick}
            aria-label="Expense Tracker"
          >
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl overflow-hidden shrink-0 border border-slate-200/80 shadow-xs transition-transform group-hover:scale-105">
              <img src="/expense-tracker.avif" alt="Expense Tracker Logo" className="h-full w-full object-cover" />
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="section-eyebrow leading-tight">Personal finance</p>
              <span className="block truncate font-display text-[1.65rem] lg:text-[1.85rem] leading-none tracking-[-0.03em] text-ink">
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
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] sm:rounded-t-[26px] border-t border-x border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,248,0.95))] px-1.5 pt-0 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(20,40,25,0.08)] backdrop-blur-2xl lg:hidden overflow-hidden"
        aria-label="Bottom navigation"
      >
        <div className="relative grid grid-cols-4 items-center">
          {/* Fluid Sliding Flat Green Dew Drop Notch Indicator */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.34,1.25,0.64,1)] flex items-start justify-center"
            style={{
              left: `${validActiveIndex * 25}%`,
              width: "25%",
              opacity: activeIndex >= 0 ? 1 : 0
            }}
          >
            <svg
              viewBox="0 0 100 62"
              preserveAspectRatio="none"
              className="w-full h-full max-h-[62px]"
              aria-hidden="true"
            >
              {/* Smartphone-style natural flat green dewdrop notch dipping down from top edge */}
              <path
                d="M 8 0 C 18 0, 22 5, 24 14 C 26 25, 28 35, 31 43 C 35 53, 42 59, 50 59 C 58 59, 65 53, 69 43 C 72 35, 74 25, 76 14 C 78 5, 82 0, 92 0 Z"
                fill="#1e7a53"
              />
            </svg>
          </div>

          {mainNavItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIndex === idx;

            return (
              <NavLink
                key={`${item.to}-bottom`}
                to={item.to}
                onClick={handleNavClick}
                className={cn(
                  "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-2 px-1 transition-all duration-200 select-none",
                  isActive
                    ? "text-white font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
                aria-label={item.label}
              >
                {/* Text label placed ABOVE over the icon */}
                <span className={cn(
                  "truncate tracking-tight text-[10.5px] leading-tight transition-colors duration-200",
                  isActive ? "text-white font-bold" : "text-slate-600 font-medium"
                )}>
                  {item.label}
                </span>

                {/* Icon placed DOWN */}
                <div className="relative flex items-center justify-center transition-transform duration-200">
                  <Icon className={cn("h-5 w-5 transition-transform duration-200", isActive && "scale-105 stroke-[2.3]")} />
                  {item.to === "/alerts" && unreadNotificationCount > 0 ? (
                    <span
                      className={cn(
                        "absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 transition-colors",
                        isActive
                          ? "bg-white text-emerald-800 ring-emerald-700 shadow-xs"
                          : "bg-rose-500 text-white ring-white"
                      )}
                      aria-hidden="true"
                    >
                      {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </div>
              </NavLink>
            );
          })}
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