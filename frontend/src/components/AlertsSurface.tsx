import { useEffect, useState } from "react";
import type { NotificationCenterProps } from "../types";
import { EmptyState, SectionHeader, StatusNotice, SurfaceCard, cn } from "./ui";

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
  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billCategory, setBillCategory] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billRecurrence, setBillRecurrence] = useState<"once" | "weekly" | "monthly" | "yearly">("monthly");
  const [billIntervalCount, setBillIntervalCount] = useState(1);
  const [billReminderDaysBefore, setBillReminderDaysBefore] = useState(3);
  const [billIsActive, setBillIsActive] = useState(true);

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
  }

  async function handleBillReminderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
    <div className={cn("grid gap-5", layout === "popover" ? "max-h-[min(78vh,920px)] overflow-y-auto pr-1" : "gap-6") }>
      <SurfaceCard className="space-y-5 p-5 sm:p-6">
        <SectionHeader
          eyebrow="Alerts"
          title="In-app reminders"
          description={
            isPopoverLayout
              ? "Review unread updates and wallet invites without opening the full alerts workspace."
              : "Run checks, clear unread items, and respond to wallet invites without leaving the current flow."
          }
          actions={
            <>
              {!isPopoverLayout ? (
                <button type="button" className="ui-button-secondary" onClick={onRefreshChecks} disabled={isRunningChecks}>
                  {isRunningChecks ? "Checking..." : "Run checks"}
                </button>
              ) : null}
              <button type="button" className="ui-button-ghost" onClick={onMarkAllRead} disabled={notifications.length === 0}>
                Mark all read
              </button>
            </>
          }
        />

        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" description="Budget nudges, due reminders, and wallet invites will appear here as they happen." />
        ) : (
          <div className="grid gap-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={cn(
                  "rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm",
                  notification.status === "unread" ? "ring-1 ring-primary/10" : ""
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("data-pill", notification.status === "unread" ? "tone-positive" : "")}>{notification.type.replace(/-/g, " ")}</span>
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{formatNotificationTime(notification.created_at)}</span>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-ink">{notification.title}</h3>
                      <p className="text-sm leading-6 text-secondary">{notification.message}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:max-w-[240px] sm:justify-end">
                    {notification.type === "wallet-invite" && notification.metadata?.walletMemberId ? (
                      <>
                        <button type="button" className="ui-button-danger" onClick={() => void onDeleteNotification(notification.id)}>
                          Delete
                        </button>
                        <button type="button" className="ui-button-secondary" onClick={() => void onRespondToWalletInvite(notification.metadata!.walletMemberId, "decline")}>
                          Decline
                        </button>
                        <button type="button" className="ui-button-primary" onClick={() => void onRespondToWalletInvite(notification.metadata!.walletMemberId, "accept")}>
                          Accept
                        </button>
                      </>
                    ) : (
                      <>
                        {notification.status === "unread" ? (
                          <button type="button" className="ui-button-ghost" onClick={() => onMarkRead(notification.id)}>
                            Mark read
                          </button>
                        ) : null}
                        <button type="button" className="ui-button-danger" onClick={() => void onDeleteNotification(notification.id)}>
                          Delete
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

      <div className={cn("grid gap-5", isPopoverLayout ? "" : "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]")}>
        <SurfaceCard className="space-y-5 p-5 sm:p-6">
          <SectionHeader eyebrow="Bills" title="Recurring reminders" description="Review due dates, edit schedules, and keep upcoming payments visible." />

          {billReminders.length === 0 ? (
            <EmptyState title="No bill reminders yet" description="Add your recurring utilities, subscriptions, or rent so the alert center can watch upcoming due dates." />
          ) : (
            <div className="grid gap-3">
              {billReminders.map((billReminder) => (
                <article key={billReminder.id} className="rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink">{billReminder.title}</h3>
                        <span className={cn("data-pill", billReminder.is_active ? "tone-positive" : "")}>{billReminder.is_active ? "Active" : "Paused"}</span>
                      </div>
                      <p className="text-sm leading-6 text-secondary">
                        Due {billReminder.due_date} · {billReminder.recurrence} every {billReminder.interval_count} {billReminder.interval_count === 1 ? "cycle" : "cycles"}
                        {billReminder.amount ? ` · ${billReminder.amount}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ui-button-ghost" onClick={() => startEditingBillReminder(billReminder.id)}>
                        Edit
                      </button>
                      <button type="button" className="ui-button-danger" onClick={() => void onDeleteBillReminder(billReminder.id)} disabled={isSavingBillReminder}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SurfaceCard>

        {!isPopoverLayout ? (
          <SurfaceCard className="space-y-5 p-5 sm:p-6">
            <SectionHeader
              eyebrow="Create"
              title={editingBillReminderId ? "Edit reminder" : "Add a reminder"}
              description="Set title, amount, cadence, and lead time so the app can notify you before each bill is due."
            />

            <form className="grid gap-4" onSubmit={(event) => void handleBillReminderSubmit(event)}>
              <label className="grid gap-2 text-sm font-medium text-secondary">
                Bill title
                <input value={billTitle} onChange={(event) => setBillTitle(event.target.value)} placeholder="Electricity bill" required />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Amount
                  <input value={billAmount} onChange={(event) => setBillAmount(event.target.value)} placeholder="0.00" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Due date
                  <input type="date" value={billDueDate} onChange={(event) => setBillDueDate(event.target.value)} required />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Category
                <input value={billCategory} onChange={(event) => setBillCategory(event.target.value)} placeholder="Utilities" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Recurrence
                  <select value={billRecurrence} onChange={(event) => setBillRecurrence(event.target.value as "once" | "weekly" | "monthly" | "yearly") }>
                    <option value="once">Once</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Interval count
                  <input type="number" min={1} max={24} value={billIntervalCount} onChange={(event) => setBillIntervalCount(Number(event.target.value) || 1)} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-secondary">
                  Reminder days before
                  <input type="number" min={0} max={60} value={billReminderDaysBefore} onChange={(event) => setBillReminderDaysBefore(Number(event.target.value) || 0)} />
                </label>
                <label className="flex min-h-14 items-center justify-between rounded-[22px] border border-[color:var(--border)] bg-white/80 px-4 py-3 text-sm font-medium text-secondary shadow-sm">
                  <span>Reminder active</span>
                  <input className="h-5 w-5 rounded-md" type="checkbox" checked={billIsActive} onChange={(event) => setBillIsActive(event.target.checked)} />
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {editingBillReminderId ? (
                  <button type="button" className="ui-button-secondary" onClick={resetBillReminderForm}>
                    Cancel edit
                  </button>
                ) : null}
                <button type="submit" className="ui-button-primary" disabled={isSavingBillReminder}>
                  {isSavingBillReminder ? "Saving..." : editingBillReminderId ? "Update reminder" : "Add reminder"}
                </button>
              </div>
            </form>
          </SurfaceCard>
        ) : null}
      </div>

      {!isPopoverLayout ? (
        preferences ? (
          <SurfaceCard className="space-y-5 p-5 sm:p-6">
            <SectionHeader eyebrow="Preferences" title="Scheduled checks" description="Tune daily nudges and budget alert thresholds without changing your main dashboard layout." />
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex min-h-14 items-center justify-between rounded-[22px] border border-[color:var(--border)] bg-white/80 px-4 py-3 text-sm font-medium text-secondary shadow-sm">
                <span>Daily logging reminder</span>
                <input className="h-5 w-5 rounded-md" type="checkbox" checked={preferences.daily_logging_enabled} onChange={(event) => onPreferencesChange("daily_logging_enabled", event.target.checked)} />
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Daily reminder hour
                <input type="number" min={0} max={23} value={preferences.daily_logging_hour} onChange={(event) => onPreferencesChange("daily_logging_hour", Number(event.target.value))} />
              </label>

              <label className="flex min-h-14 items-center justify-between rounded-[22px] border border-[color:var(--border)] bg-white/80 px-4 py-3 text-sm font-medium text-secondary shadow-sm">
                <span>Budget alerts</span>
                <input className="h-5 w-5 rounded-md" type="checkbox" checked={preferences.budget_alerts_enabled} onChange={(event) => onPreferencesChange("budget_alerts_enabled", event.target.checked)} />
              </label>

              <label className="grid gap-2 text-sm font-medium text-secondary">
                Budget alert threshold (%)
                <input type="number" min={1} max={100} value={preferences.budget_alert_threshold} onChange={(event) => onPreferencesChange("budget_alert_threshold", Number(event.target.value))} />
              </label>
            </div>

            <div className="flex justify-end">
              <button type="button" className="ui-button-primary" onClick={onSavePreferences} disabled={isSavingPreferences}>
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