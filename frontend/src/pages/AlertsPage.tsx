import { AlertsSurface } from "../components/AlertsSurface";
import { PageHero } from "../components/ui";
import type { NotificationCenterProps } from "../types";

type AlertsPageProps = Omit<NotificationCenterProps, "notificationPanelRef" | "isOpen" | "onToggle" | "unreadCount">;

export function AlertsPage(props: AlertsPageProps) {
  return (
    <>
      <PageHero
        eyebrow="Alerts"
        title="Stay ahead of due dates, nudges, and shared-wallet moments."
        description="Use this space to review recurring bills, respond to group invites, and keep reminders intentional instead of noisy."
      />
      <AlertsSurface {...props} layout="page" />
    </>
  );
}