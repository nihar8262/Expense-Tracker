package com.expensetracker.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(
    name = "SystemNotifications",
    permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
)
public class SystemNotificationsPlugin extends Plugin {
    private static final String BUDGET_CHANNEL = "finance_space_budgets";
    private static final String PAYMENT_CHANNEL = "finance_space_payments";
    private static final String COLLAB_CHANNEL = "finance_space_collaboration";

    @Override
    public void load() {
        createChannels();
    }

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is not granted.");
            return;
        }
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));
        String title = call.getString("title", "Finance Space");
        String body = call.getString("body", "You have a new update.");
        String category = call.getString("category", "collaboration");
        String channel = "budget".equals(category) ? BUDGET_CHANNEL : "payment".equals(category) ? PAYMENT_CHANNEL : COLLAB_CHANNEL;

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("notification_route", "/alerts");
        PendingIntent pendingIntent = PendingIntent.getActivity(
            getContext(), id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
        NotificationManagerCompat.from(getContext()).notify(id.hashCode(), builder.build());
        call.resolve();
    }

    @PluginMethod
    public void getLaunchTarget(PluginCall call) {
        JSObject result = new JSObject();
        Intent intent = getActivity().getIntent();
        String route = intent == null ? null : intent.getStringExtra("notification_route");
        if (route == null && intent != null) route = intent.getStringExtra("route");
        result.put("route", route == null ? "" : route);
        if (intent != null && route != null) {
            intent.removeExtra("notification_route");
            intent.removeExtra("route");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void getPushToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    call.reject("Could not obtain the Firebase push token.", task.getException());
                    return;
                }
                JSObject result = new JSObject();
                result.put("token", task.getResult());
                call.resolve(result);
            });
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
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
