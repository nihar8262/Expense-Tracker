package com.expensetracker.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NotificationCaptureService extends NotificationListenerService {
    static final String PREFS_NAME = "finance_space_notification_reader";
    static final String ITEMS_KEY = "detected_debits";
    private static final int MAX_ITEMS = 100;
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:\\u20B9|INR|Rs\\.?)(?:\\s|:)*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE
    );
    private static final String[] DEBIT_MARKERS = {
        "debited", "debit", "spent", "paid", "payment of", "purchase", "withdrawn", "sent", "transferred"
    };

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        if (notification == null || getPackageName().equals(notification.getPackageName())) return;
        Notification androidNotification = notification.getNotification();
        if (androidNotification == null || androidNotification.extras == null) return;
        String title = value(androidNotification.extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = value(androidNotification.extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = value(androidNotification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        String combined = (title + " " + text + " " + bigText).trim();
        if (!containsDebitMarker(combined.toLowerCase(Locale.ROOT))) return;
        Matcher matcher = AMOUNT_PATTERN.matcher(combined);
        if (!matcher.find()) return;
        try {
            JSONObject item = new JSONObject();
            item.put("id", notification.getPackageName() + ":" + notification.getId() + ":" + notification.getPostTime());
            item.put("packageName", notification.getPackageName());
            item.put("appName", resolveAppName(notification.getPackageName()));
            item.put("title", title);
            item.put("text", bigText.isEmpty() ? text : bigText);
            item.put("amount", matcher.group(1).replace(",", ""));
            item.put("detectedAt", notification.getPostTime());
            saveItem(item);
            showDetectedDebit(item);
        } catch (Exception ignored) {
            // Third-party notification formats must never affect the host app.
        }
    }

    private void showDetectedDebit(JSONObject item) {
        try {
            String channelId = "finance_space_detected_debits";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager manager = getSystemService(NotificationManager.class);
                manager.createNotificationChannel(new NotificationChannel(channelId, "Detected debit transactions", NotificationManager.IMPORTANCE_HIGH));
            }
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("notification_route", "/alerts");
            PendingIntent pendingIntent = PendingIntent.getActivity(this, item.getString("id").hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String body = "Review and add this " + item.optString("appName", "bank") + " debit as an expense.";
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Debit detected: \u20B9" + item.optString("amount"))
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE);
            NotificationManagerCompat.from(this).notify(item.getString("id").hashCode(), builder.build());
        } catch (Exception ignored) {
            // Permission can be enabled later; the captured debit remains stored.
        }
    }

    private boolean containsDebitMarker(String text) {
        for (String marker : DEBIT_MARKERS) if (text.contains(marker)) return true;
        return false;
    }

    private String resolveAppName(String packageName) {
        try {
            return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(packageName, 0)).toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private void saveItem(JSONObject item) throws Exception {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        JSONArray current = new JSONArray(preferences.getString(ITEMS_KEY, "[]"));
        JSONArray next = new JSONArray();
        next.put(item);
        for (int index = 0; index < current.length() && next.length() < MAX_ITEMS; index++) next.put(current.get(index));
        preferences.edit().putString(ITEMS_KEY, next.toString()).apply();
    }

    private static String value(CharSequence value) { return value == null ? "" : value.toString(); }
}
