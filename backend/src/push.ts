import { getMessaging } from "firebase-admin/messaging";
import { getFirebaseAdminApp } from "./auth.js";
import type { NotificationRecord } from "./store/types.js";

const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

export async function sendPushNotification(tokens: string[], notification: NotificationRecord): Promise<string[]> {
  if (tokens.length === 0) return [];
  const response = await getMessaging(getFirebaseAdminApp()).sendEachForMulticast({
    tokens,
    notification: { title: notification.title, body: notification.message },
    data: {
      type: notification.type,
      notificationId: notification.id,
      route: "/alerts"
    },
    android: {
      priority: "high",
      notification: {
        channelId: notification.type.startsWith("budget") || notification.type === "bill-due" || notification.type === "daily-log"
          ? "finance_space_budgets"
          : notification.type.startsWith("loan") ? "finance_space_payments" : "finance_space_collaboration",
        icon: "ic_notification",
        sound: "default"
      }
    }
  });

  const invalidTokens: string[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success && result.error?.code && invalidTokenCodes.has(result.error.code)) {
      invalidTokens.push(tokens[index]);
    }
  });
  return invalidTokens;
}
