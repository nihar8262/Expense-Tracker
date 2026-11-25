import { registerPlugin } from "@capacitor/core";
import type { Notification } from "../types";
import type { LocalBudgetAlert } from "./localDeviceStore";
import type { DetectedDebit } from "./notificationReader";

type SystemNotificationsPlugin = {
  getPermissionStatus(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  getLaunchTarget(): Promise<{ route: string }>;
  getPushToken(): Promise<{ token: string }>;
  show(input: { id: string; title: string; body: string; category: "budget" | "payment" | "collaboration" }): Promise<void>;
};

const SystemNotifications = registerPlugin<SystemNotificationsPlugin>("SystemNotifications");
const shownKey = "finance-space.android-system-notifications-shown";
const inboxKey = (userId: string) => `finance-space.android-local-notifications.${userId}`;
const dismissedKey = (userId: string) => `finance-space.android-dismissed-notifications.${userId}`;

function readShownIds(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(shownKey) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function reserveNotification(notificationId: string): boolean {
  const shown = readShownIds();
  if (shown.has(notificationId)) return false;
  shown.add(notificationId);
  window.localStorage.setItem(shownKey, JSON.stringify([...shown].slice(-300)));
  return true;
}

function releaseNotification(notificationId: string) {
  const shown = readShownIds();
  shown.delete(notificationId);
  window.localStorage.setItem(shownKey, JSON.stringify([...shown].slice(-300)));
}

function dismissedIds(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(dismissedKey(userId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export const getSystemNotificationPermission = () => SystemNotifications.getPermissionStatus();
export const requestSystemNotificationPermission = () => SystemNotifications.requestPermission();
export const consumeSystemNotificationLaunchTarget = () => SystemNotifications.getLaunchTarget();
export const getSystemPushToken = () => SystemNotifications.getPushToken();

function categoryFor(type: string): "budget" | "payment" | "collaboration" {
  if (type.startsWith("budget") || type === "bill-due" || type === "daily-log") return "budget";
  if (type.startsWith("loan") || type === "detected-debit") return "payment";
  return "collaboration";
}

export async function publishUnreadSystemNotifications(notifications: Notification[]) {
  const permission = await getSystemNotificationPermission();
  if (!permission.granted) return;
  for (const notification of notifications.filter((item) => item.status === "unread")) {
    if (!reserveNotification(notification.id)) continue;
    try {
      await SystemNotifications.show({
        id: notification.id,
        title: notification.title,
        body: notification.message,
        category: categoryFor(notification.type)
      });
    } catch (error) {
      releaseNotification(notification.id);
      throw error;
    }
  }
}


export function listLocalSystemNotifications(userId: string): Notification[] {
  try {
    return JSON.parse(window.localStorage.getItem(inboxKey(userId)) ?? "[]") as Notification[];
  } catch {
    return [];
  }
}

function writeLocalSystemNotifications(userId: string, notifications: Notification[]) {
  const unique = [...new Map(notifications.map((item) => [item.id, item])).values()];
  window.localStorage.setItem(inboxKey(userId), JSON.stringify(unique.slice(0, 100)));
}

export function cacheRemoteSystemNotifications(userId: string, notifications: Notification[]): Notification[] {
  const dismissed = dismissedIds(userId);
  const existing = listLocalSystemNotifications(userId);
  const merged = [...new Map(
    [...existing, ...notifications]
      .filter((item) => !dismissed.has(item.id))
      .map((item) => [item.id, item])
  ).values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
  writeLocalSystemNotifications(userId, merged);
  return merged;
}

export function importDetectedDebitNotifications(userId: string, debits: DetectedDebit[]) {
  const existing = listLocalSystemNotifications(userId);
  const existingIds = new Set(existing.map((item) => item.id));
  const dismissed = dismissedIds(userId);
  const added: Notification[] = debits
    .map((debit): Notification => ({
      id: `local-debit-${debit.id}`,
      type: "detected-debit",
      title: `Debit detected: ₹${debit.amount}`,
      message: debit.text || `${debit.appName} reported a debit transaction. Review it before adding an expense.`,
      status: "unread",
      created_at: new Date(debit.detectedAt).toISOString(),
      read_at: null,
      scheduled_for: null,
      metadata: {
        source: "device",
        amount: debit.amount,
        description: debit.text || debit.title || debit.appName,
        appName: debit.appName
      }
    }))
    .filter((item) => !existingIds.has(item.id) && !dismissed.has(item.id));
  if (added.length > 0) writeLocalSystemNotifications(userId, [...added, ...existing]);
  return [...added, ...existing].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function markLocalSystemNotificationRead(userId: string, notificationId: string) {
  const now = new Date().toISOString();
  const notifications = listLocalSystemNotifications(userId).map((item) => (
    item.id === notificationId ? { ...item, status: "read" as const, read_at: now } : item
  ));
  writeLocalSystemNotifications(userId, notifications);
  return notifications;
}

export function markAllLocalSystemNotificationsRead(userId: string) {
  const now = new Date().toISOString();
  const notifications = listLocalSystemNotifications(userId).map((item) => ({
    ...item,
    status: "read" as const,
    read_at: item.read_at ?? now
  }));
  writeLocalSystemNotifications(userId, notifications);
  return notifications;
}

export function deleteLocalSystemNotification(userId: string, notificationId: string) {
  const notifications = listLocalSystemNotifications(userId).filter((item) => item.id !== notificationId);
  const dismissed = dismissedIds(userId);
  dismissed.add(notificationId);
  window.localStorage.setItem(dismissedKey(userId), JSON.stringify([...dismissed].slice(-500)));
  writeLocalSystemNotifications(userId, notifications);
  return notifications;
}

export async function publishLocalBudgetAlerts(alerts: LocalBudgetAlert[], userId: string) {
  const existingInbox = listLocalSystemNotifications(userId);
  const existingIds = new Set(existingInbox.map((item) => item.id));
  const dismissed = dismissedIds(userId);
  const createdAt = new Date().toISOString();
  const newInboxItems: Notification[] = alerts
    .filter((alert) => !existingIds.has(alert.id) && !dismissed.has(alert.id))
    .map((alert) => ({
      id: alert.id,
      type: alert.id.startsWith("local-budget-overspent") ? "budget-overspent" : "budget-threshold",
      title: alert.title,
      message: alert.message,
      status: "unread",
      created_at: createdAt,
      read_at: null,
      scheduled_for: null,
      metadata: { source: "device" }
    }));
  if (newInboxItems.length > 0) {
    writeLocalSystemNotifications(userId, [...newInboxItems, ...existingInbox]);
  }

  const permission = await getSystemNotificationPermission();
  if (!permission.granted) return;
  for (const alert of alerts) {
    if (dismissed.has(alert.id) || !reserveNotification(alert.id)) continue;
    try {
      await SystemNotifications.show({ ...alert, body: alert.message, category: "budget" });
    } catch (error) {
      releaseNotification(alert.id);
      throw error;
    }
  }
}
