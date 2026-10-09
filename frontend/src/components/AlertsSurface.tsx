import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationCenterProps } from "../types";
import { EmptyState, StatusNotice, SurfaceCard, cn } from "./ui";
import { FilterDropdown } from "./FilterDropdown";
import { CheckCheck, RefreshCw } from "lucide-react";

type AlertsSurfaceProps = Omit<NotificationCenterProps, "notificationPanelRef" | "isOpen" | "onToggle" | "unreadCount"> & {
  layout?: "popover" | "page";
};

function formatNotificationTime(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsedDate);
}

export function AlertsSurface({
  notifications,
  billReminders,
  isSavingPreferences,
  isSavingBillReminder,
  isRunningChecks,
  preferences,
  wallets,
  preferenceScope,
  onPreferenceScopeChange,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotification,
  onRefreshChecks,
  onRespondToWalletInvite,
  onSaveBillReminder,
  onDeleteBillReminder,
  onPreferencesChange,
  onSavePreferences,
  layout = "popover"
}: AlertsSurfaceProps) {
  const isPopoverLayout = layout === "popover";
  const [editingBillReminderId, setEditingBillReminderId] = useState<string | null>(null);
  const [deletingNotificationIds, setDeletingNotificationIds] = useState<string[]>([]);
  const [respondingInviteIds, setRespondingInviteIds] = useState<string[]>([]);
  const [deletingBillReminderIds, setDeletingBillReminderIds] = useState<string[]>([]);
  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billCategory, setBillCategory] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billRecurrence, setBillRecurrence] = useState<"once" | "weekly" | "monthly" | "yearly">("monthly");
  const [billIntervalCount, setBillIntervalCount] = useState(1);
  const [billReminderDaysBefore, setBillReminderDaysBefore] = useState(3);
  const [billIsActive, setBillIsActive] = useState(true);
  const [showBillValidation, setShowBillValidation] = useState(false);

  const billErrors = useMemo(
    () => ({
      title: billTitle.trim() ? "" : "Bill title is required.",
      dueDate: billDueDate.trim() ? "" : "Due date is required."
    }),
    [billTitle, billDueDate]
  );

  useEffect(() => {
    if (editingBillReminderId && !billReminders.some((billReminder) => billReminder.id === editingBillReminderId)) {
      setEditingBillReminderId(null);
    }
  }, [billReminders, editingBillReminderId]);

  function resetBillReminderForm() {
    setEditingBillReminderId(null);
    setBillTitle("");
    setBillAmount("");
    setBillCategory("");
    setBillDueDate("");
    setBillRecurrence("monthly");
    setBillIntervalCount(1);
    setBillReminderDaysBefore(3);
    setBillIsActive(true);
    setShowBillValidation(false);
  }

  async function handleDeleteNotification(notificationId: string) {
    setDeletingNotificationIds((current) => [...new Set([...current, notificationId])]);
    try {
      await onDeleteNotification(notificationId);
    } finally {
      setDeletingNotificationIds((current) => current.filter((id) => id !== notificationId));
    }
  }

  async function handleRespondToInvite(walletMemberId: string, action: "accept" | "decline") {
    setRespondingInviteIds((current) => [...new Set([...current, walletMemberId])]);
    try {
      await onRespondToWalletInvite(walletMemberId, action);
    } finally {
      setRespondingInviteIds((current) => current.filter((id) => id !== walletMemberId));
    }
  }

  async function handleDeleteBillReminder(billReminderId: string) {
    setDeletingBillReminderIds((current) => [...new Set([...current, billReminderId])]);
    try {
      await onDeleteBillReminder(billReminderId);
    } finally {
      setDeletingBillReminderIds((current) => current.filter((id) => id !== billReminderId));
    }
  }

  async function handleBillReminderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowBillValidation(true);

    if (Object.values(billErrors).some(Boolean)) {
      return;
    }

    const saved = await onSaveBillReminder(
      {
        title: billTitle,
        amount: billAmount,
        category: billCategory,
        dueDate: billDueDate,
        recurrence: billRecurrence,
        intervalCount: billIntervalCount,
        reminderDaysBefore: billReminderDaysBefore,
        isActive: billIsActive
      },
      editingBillReminderId ?? undefined
    );

    if (saved) {
      resetBillReminderForm();
    }
  }

  function startEditingBillReminder(billReminderId: string) {
    const billReminder = billReminders.find((entry) => entry.id === billReminderId);

    if (!billReminder) {
      return;
    }

    setEditingBillReminderId(billReminder.id);
    setBillTitle(billReminder.title);
    setBillAmount(billReminder.amount ?? "");
    setBillCategory(billReminder.category ?? "");
    setBillDueDate(billReminder.due_date);
    setBillRecurrence(billReminder.recurrence);
    setBillIntervalCount(billReminder.interval_count);
    setBillReminderDaysBefore(billReminder.reminder_days_before);
    setBillIsActive(billReminder.is_active);
  }

  return (
    <div className={cn("grid gap-4", layout === "popover" ? "max-h-[min(78vh,920px)] overflow-y-auto pr-1" : "gap-4 sm:gap-5") }>
      {/* Notifications Card */}
      <SurfaceCard className="space-y-3.5 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1.5 border-b border-[color:var(--border)]/60">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-ink">
                In-App Notifications
              </h2>
              {notifications.length > 0 && (
                <span className="text-xs text-muted font-medium">
                  ({notifications.length})
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              Personal budget nudges, bill reminders, and wallet activity.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {!isPopoverLayout ? (
              <button
                type="button"
                className="ui-button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                onClick={onRefreshChecks}
                disabled={isRunningChecks}
              >
                <RefreshCw className={isRunningChecks ? "size-3 animate-spin" : "size-3"} />
                <span>{isRunningChecks ? "Checking..." : "Run checks"}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="ui-button-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5"
              onClick={onMarkAllRead}
              disabled={notifications.length === 0}
            >
              <CheckCheck className="size-3" />
              <span>Mark all read</span>
            </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" description="Personal budget nudges, bill due reminders, and shared wallet invites will appear here as they happen." />
        ) : (
          <div className="grid gap-2.5">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={cn(
                  "rounded-[16px] sm:rounded-[18px] border border-[color:var(--border)] bg-white/80 p-3 sm:p-3.5 shadow-2xs transition-colors",
                  notification.status === "unread" ? "ring-1 ring-primary/20 bg-primary/[0.02]" : ""
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {notification.type === "loan-overdue" ? (
                        <span className="data-pill tone-danger font-semibold text-[11px] py-0.5 px-2">⚠️ Loan Overdue</span>
                      ) : notification.type === "loan-issued" ? (
                        <span className="data-pill tone-positive font-semibold text-[11px] py-0.5 px-2">📄 Loan Issued</span>
                      ) : (
                        <span className={cn("data-pill text-[11px] py-0.5 px-2", notification.status === "unread" ? "tone-positive font-semibold" : "")}>
                          {notification.type.replace(/-/g, " ")}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-muted">{formatNotificationTime(notification.created_at)}</span>
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-semibold text-ink">{notification.title}</h3>
                      <p className="text-xs leading-5 text-secondary">{notification.message}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[280px] sm:justify-end shrink-0 pt-1 sm:pt-0">
                    {notification.type === "wallet-invite" && notification.metadata?.walletMemberId && notification.status === "unread" ? (
                      <>
                        <button type="button" className="ui-button-danger text-xs px-2.5 py-1" disabled={deletingNotificationIds.includes(notification.id) || respondingInviteIds.includes(notification.metadata!.walletMemberId)} onClick={() => void handleDeleteNotification(notification.id)}>
                          {deletingNotificationIds.includes(notification.id) ? "Deleting..." : "Delete"}
                        </button>
                        <button type="button" className="ui-button-secondary text-xs px-2.5 py-1" disabled={respondingInviteIds.includes(notification.metadata!.walletMemberId) || deletingNotificationIds.includes(notification.id)} onClick={() => void handleRespondToInvite(notification.metadata!.walletMemberId, "decline")}>
                          {respondingInviteIds.includes(notification.metadata!.walletMemberId) ? "Declining..." : "Decline"}
                        </button>
                        <button type="button" className="ui-button-primary text-xs px-2.5 py-1" disabled={respondingInviteIds.includes(notification.metadata!.walletMemberId) || deletingNotificationIds.includes(notification.id)} onClick={() => void handleRespondToInvite(notification.metadata!.walletMemberId, "accept")}>
                          {respondingInviteIds.includes(notification.metadata!.walletMemberId) ? "Accepting..." : "Accept"}
                        </button>
                      </>
                    ) : (
                      <>
                        {(notification.type === "loan-issued" || notification.type === "loan-overdue") && (
                          <Link to="/wallets" className="ui-button-secondary text-xs px-2.5 py-1">
                            View Loan
                          </Link>
                        )}
                        {notification.status === "unread" ? (
                          <button type="button" className="ui-button-ghost text-xs px-2.5 py-1" onClick={() => onMarkRead(notification.id)}>
                            Mark read
                          </button>
                        ) : null}
                        <button type="button" className="ui-button-danger text-xs px-2.5 py-1" disabled={deletingNotificationIds.includes(notification.id)} onClick={() => void handleDeleteNotification(notification.id)}>
                          {deletingNotificationIds.includes(notification.id) ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfaceCard>

      {/* Bills & Reminders Split Section */}
      <div className={cn("grid gap-4", isPopoverLayout ? "" : "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]")}>
        {/* Recurring Reminders List Card */}
        <SurfaceCard className="space-y-3.5 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-[color:var(--border)]/60">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-ink">
                  Recurring Bills
                </h2>
                {billReminders.length > 0 && (
                  <span className="text-xs text-muted font-medium">
                    ({billReminders.length})
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Track subscriptions and utility billing cycles.
              </p>
            </div>
          </div>

          {billReminders.length === 0 ? (
            <EmptyState title="No bill reminders yet" description="Add your recurring utilities, subscriptions, or rent so the alert center can watch upcoming due dates." />
          ) : (
            <div className="grid gap-2.5">
              {billReminders.map((billReminder) => (
                <article key={billReminder.id} className="rounded-[16px] border border-[color:var(--border)] bg-white/80 p-3 sm:p-3.5 shadow-2xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-ink">{billReminder.title}</h3>
                        {billReminder.category && (
                          <span className="data-pill text-[11px] py-0.5 px-2">
                            {billReminder.category.toLowerCase().includes("credit") || billReminder.category.toLowerCase().includes("card") || billReminder.category.toLowerCase().includes("statement") ? "💳 " : ""}
                            {billReminder.category}
                          </span>
                        )}
                        <span className={cn("data-pill text-[11px] py-0.5 px-2", billReminder.is_active ? "tone-positive" : "")}>
                          {billReminder.is_active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-secondary">
                        Due {billReminder.due_date} · {billReminder.recurrence} every {billReminder.interval_count} {billReminder.interval_count === 1 ? "cycle" : "cycles"}
                        {billReminder.amount ? ` · ₹${billReminder.amount}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0 pt-1 sm:pt-0">
                      <button type="button" className="ui-button-ghost text-xs px-2.5 py-1" onClick={() => startEditingBillReminder(billReminder.id)}>
                        Edit
                      </button>
                      <button type="button" className="ui-button-danger text-xs px-2.5 py-1" onClick={() => void handleDeleteBillReminder(billReminder.id)} disabled={isSavingBillReminder || deletingBillReminderIds.includes(billReminder.id)}>
                        {deletingBillReminderIds.includes(billReminder.id) ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Schedule / Edit Form Card */}
        {!isPopoverLayout ? (
          <SurfaceCard className="space-y-3.5 p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-[color:var(--border)]/60">
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-ink">
                  {editingBillReminderId ? "Edit Bill Reminder" : "Schedule Bill Reminder"}
                </h2>
                <p className="text-xs text-muted">
                  Configure timing, cadence, and alert lead days.
                </p>
              </div>
              {editingBillReminderId && (
                <button type="button" className="text-xs text-muted hover:text-ink font-medium" onClick={resetBillReminderForm}>
                  Cancel
                </button>
              )}
            </div>

            {/* Quick Presets */}
            <div className="rounded-xl border border-[color:var(--border)] bg-white/50 p-2.5 space-y-1.5">
              <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
                <span>💳</span> Quick Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBillTitle("Credit Card Payment Due Date");
                    setBillCategory("Credit Card Due Date");
                    setBillRecurrence("monthly");
                    setBillIntervalCount(1);
                    setBillReminderDaysBefore(3);
                  }}
                  className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  💳 CC Due Date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBillTitle("Credit Card Statement Generation");
                    setBillCategory("Credit Card Statement");
                    setBillRecurrence("monthly");
                    setBillIntervalCount(1);
                    setBillReminderDaysBefore(1);
                  }}
                  className="rounded-lg border border-amber-500/20 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  📄 CC Statement
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBillTitle("Electricity / Utility Bill");
                    setBillCategory("Utilities");
                    setBillRecurrence("monthly");
                    setBillIntervalCount(1);
                    setBillReminderDaysBefore(3);
                  }}
                  className="rounded-lg border border-[color:var(--border)] bg-white px-2 py-0.5 text-xs font-medium text-secondary hover:text-ink transition-colors"
                >
                  ⚡ Utilities
                </button>
              </div>
            </div>

            <form className="grid gap-3" onSubmit={(event) => void handleBillReminderSubmit(event)} noValidate>
              {/* Row 1: Bill Title & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span className="required-mark">Bill title</span>
                  <input
                    className="h-[38px] text-xs"
                    value={billTitle}
                    onChange={(event) => setBillTitle(event.target.value)}
                    placeholder="Electricity bill"
                    required
                    aria-invalid={showBillValidation && Boolean(billErrors.title)}
                  />
                  {showBillValidation && billErrors.title ? <span className="text-[11px] text-[color:var(--danger-text)]">{billErrors.title}</span> : null}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span>Amount (Optional)</span>
                  <input
                    className="h-[38px] text-xs"
                    value={billAmount}
                    onChange={(event) => setBillAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>

              {/* Row 2: Due Date & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span className="required-mark">Due date</span>
                  <input
                    type="date"
                    className="h-[38px] text-xs"
                    value={billDueDate}
                    onChange={(event) => setBillDueDate(event.target.value)}
                    required
                    aria-invalid={showBillValidation && Boolean(billErrors.dueDate)}
                  />
                  {showBillValidation && billErrors.dueDate ? <span className="text-[11px] text-[color:var(--danger-text)]">{billErrors.dueDate}</span> : null}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span>Category</span>
                  <input
                    className="h-[38px] text-xs"
                    value={billCategory}
                    onChange={(event) => setBillCategory(event.target.value)}
                    placeholder="Utilities"
                  />
                </label>
              </div>

              {/* Row 3: Recurrence & Interval Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterDropdown
                  label="Recurrence"
                  variant="form"
                  value={billRecurrence}
                  onChange={(val) => setBillRecurrence(val as "once" | "weekly" | "monthly" | "yearly")}
                  options={[
                    { value: "once", label: "Once" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />
                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span>Interval count</span>
                  <input
                    className="h-[38px] text-xs"
                    type="number"
                    min={1}
                    max={24}
                    value={billIntervalCount}
                    onChange={(event) => setBillIntervalCount(Number(event.target.value) || 1)}
                  />
                </label>
              </div>

              {/* Row 4: Reminder Days & Active Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <label className="grid gap-1 text-xs font-semibold text-secondary">
                  <span>Lead days (before due)</span>
                  <input
                    className="h-[38px] text-xs"
                    type="number"
                    min={0}
                    max={60}
                    value={billReminderDaysBefore}
                    onChange={(event) => setBillReminderDaysBefore(Number(event.target.value) || 0)}
                  />
                </label>
                <label className="flex h-[38px] items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-secondary shadow-2xs">
                  <span>Reminder active</span>
                  <input className="h-4 w-4 rounded-md" type="checkbox" checked={billIsActive} onChange={(event) => setBillIsActive(event.target.checked)} />
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-[color:var(--border)]/60">
                {editingBillReminderId ? (
                  <button type="button" className="ui-button-secondary text-xs px-3 py-1.5" onClick={resetBillReminderForm}>
                    Cancel edit
                  </button>
                ) : null}
                <button type="submit" className="ui-button-primary text-xs px-3.5 py-1.5" disabled={isSavingBillReminder}>
                  {isSavingBillReminder ? "Saving..." : editingBillReminderId ? "Update reminder" : "Add reminder"}
                </button>
              </div>
            </form>
          </SurfaceCard>
        ) : null}
      </div>

      {/* Scheduled Checks & Preferences Card */}
      {!isPopoverLayout ? (
        preferences ? (
          <SurfaceCard className="relative z-20 space-y-3.5 p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-1.5 border-b border-[color:var(--border)]/60">
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-ink">
                  Automated Checks & Thresholds
                </h2>
                <p className="text-xs text-muted">
                  Tune daily nudges and budget alert warning limits.
                </p>
              </div>
              <div className="w-full sm:w-60">
                <FilterDropdown
                  label=""
                  variant="form"
                  value={preferenceScope}
                  onChange={(val) => onPreferenceScopeChange(val)}
                  options={[
                    { value: "personal", label: "Personal Account" },
                    ...wallets.map((wallet) => ({
                      value: wallet.id,
                      label: `Wallet: ${wallet.name}`,
                    })),
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {preferenceScope === "personal" && (
                <>
                  <label className="flex h-[38px] items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-secondary shadow-2xs self-end">
                    <span>Daily logging reminder</span>
                    <input className="h-4 w-4 rounded-md" type="checkbox" checked={preferences.daily_logging_enabled} onChange={(event) => onPreferencesChange("daily_logging_enabled", event.target.checked)} />
                  </label>

                  <label className="grid gap-1 text-xs font-semibold text-secondary">
                    <span>Daily reminder hour (0-23)</span>
                    <input className="h-[38px] text-xs" type="number" min={0} max={23} value={preferences.daily_logging_hour} onChange={(event) => onPreferencesChange("daily_logging_hour", Number(event.target.value))} />
                  </label>
                </>
              )}

              <label className="flex h-[38px] items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-secondary shadow-2xs self-end">
                <span>Budget alerts</span>
                <input className="h-4 w-4 rounded-md" type="checkbox" checked={preferences.budget_alerts_enabled} onChange={(event) => onPreferencesChange("budget_alerts_enabled", event.target.checked)} />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-secondary">
                <span>Budget alert threshold (%)</span>
                <input className="h-[38px] text-xs" type="number" min={1} max={100} value={preferences.budget_alert_threshold} onChange={(event) => onPreferencesChange("budget_alert_threshold", Number(event.target.value))} />
              </label>
            </div>

            <div className="flex justify-end pt-1 border-t border-[color:var(--border)]/60">
              <button type="button" className="ui-button-primary text-xs px-3.5 py-1.5" onClick={onSavePreferences} disabled={isSavingPreferences}>
                {isSavingPreferences ? "Saving..." : "Save settings"}
              </button>
            </div>
          </SurfaceCard>
        ) : (
          <StatusNotice tone="neutral">Reminder settings will appear once your account preferences have loaded.</StatusNotice>
        )
      ) : null}
    </div>
  );
}