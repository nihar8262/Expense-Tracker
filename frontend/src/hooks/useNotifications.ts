import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { BillReminderRecurrence, ReminderPreferences } from "../types";
import * as api from "../services/api";

export function useNotifications() {
  return {
    listNotifications: useCallback((user: User) => api.listNotifications(user), []),
    markNotificationRead: useCallback((notificationId: string, user: User) => api.markNotificationRead(notificationId, user), []),
    markAllNotificationsRead: useCallback((user: User) => api.markAllNotificationsRead(user), []),
    deleteNotification: useCallback((notificationId: string, user: User) => api.deleteNotification(notificationId, user), []),
    runNotificationChecks: useCallback((user: User) => api.runNotificationChecks(user), []),
    respondToWalletInvite: useCallback((walletMemberId: string, action: "accept" | "decline", user: User) => api.respondToWalletInvite(walletMemberId, action, user), []),
    listBillReminders: useCallback((user: User) => api.listBillReminders(user), []),
    saveBillReminder: useCallback((input: { title: string; amount: string; category: string; dueDate: string; recurrence: BillReminderRecurrence; intervalCount: number; reminderDaysBefore: number; isActive: boolean }, user: User, billReminderId?: string) => api.saveBillReminder(input, user, billReminderId), []),
    deleteBillReminderEntry: useCallback((billReminderId: string, user: User) => api.deleteBillReminderEntry(billReminderId, user), []),
    getReminderPreferences: useCallback((user: User) => api.getReminderPreferences(user), []),
    updateReminderPreferences: useCallback((user: User, preferences: ReminderPreferences) => api.updateReminderPreferences(user, preferences), [])
  };
}
