package com.expensetracker.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class PushMessagingService extends FirebaseMessagingService {
    private static final String BUDGET_CHANNEL = "finance_space_budgets";
    private static final String PAYMENT_CHANNEL = "finance_space_payments";
    private static final String COLLAB_CHANNEL = "finance_space_collaboration";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String title = remoteMessage.getNotification() != null && remoteMessage.getNotification().getTitle() != null
            ? remoteMessage.getNotification().getTitle() : data.getOrDefault("title", "Expense Tracker");
        String body = remoteMessage.getNotification() != null && remoteMessage.getNotification().getBody() != null
            ? remoteMessage.getNotification().getBody() : data.getOrDefault("body", "You have a new update.");
        String type = data.getOrDefault("type", "");
        String notificationId = data.getOrDefault("notificationId", String.valueOf(System.currentTimeMillis()));
        String channel = type.startsWith("budget") || "bill-due".equals(type) || "daily-log".equals(type)
            ? BUDGET_CHANNEL
            : type.startsWith("loan") ? PAYMENT_CHANNEL : COLLAB_CHANNEL;

        createChannels();
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("notification_route", data.getOrDefault("route", "/alerts"));
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, notificationId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
        try {
            NotificationManagerCompat.from(this).notify(notificationId.hashCode(), builder.build());
        } catch (SecurityException ignored) {
            // Android notification permission can be declined independently of FCM token registration.
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel(BUDGET_CHANNEL, "Budgets and reminders", "Budget limits, bills, and spending reminders"));
        manager.createNotificationChannel(channel(PAYMENT_CHANNEL, "Payments and loans", "Loan, repayment, and payment updates"));
        manager.createNotificationChannel(channel(COLLAB_CHANNEL, "Shared wallets", "Shared-wallet invitations and member activity"));
    }

    private NotificationChannel channel(String id, String name, String description) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        return channel;
    }
}
