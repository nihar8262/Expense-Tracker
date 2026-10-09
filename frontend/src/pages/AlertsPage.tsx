import { useMemo } from "react";
import { AlertsSurface } from "../components/AlertsSurface";
import { Bell } from "lucide-react";
import type { NotificationCenterProps } from "../types";

type AlertsPageProps = Omit<NotificationCenterProps, "notificationPanelRef" | "isOpen" | "onToggle" | "unreadCount">;

export function AlertsPage(props: AlertsPageProps) {
  const unreadCount = useMemo(
    () => props.notifications.filter((n) => n.status === "unread").length,
    [props.notifications]
  );

  return (
    <div className="space-y-4">
      {/* Sleek Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Alerts & Reminders
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <Bell className="size-3" />
              <span>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </span>
            </span>
            {props.isRunningChecks && (
              <span className="text-[11px] font-medium text-muted flex items-center gap-1 animate-pulse">
                • Checking...
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Review due dates, bill cadences, and budget thresholds in real time.
          </p>
        </div>
      </div>

      <AlertsSurface {...props} layout="page" />
    </div>
  );
}