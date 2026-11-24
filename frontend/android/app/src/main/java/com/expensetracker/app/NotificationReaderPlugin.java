package com.expensetracker.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

@CapacitorPlugin(name = "NotificationReader")
public class NotificationReaderPlugin extends Plugin {
    @PluginMethod
    public void deleteDetectedDebit(PluginCall call) {
        String targetId = call.getString("id");
        if (targetId == null || targetId.isEmpty()) {
            call.reject("A detected debit id is required.");
            return;
        }
        SharedPreferences preferences = getContext().getSharedPreferences(
            NotificationCaptureService.PREFS_NAME, android.content.Context.MODE_PRIVATE
        );
        try {
            JSONArray items = new JSONArray(preferences.getString(NotificationCaptureService.ITEMS_KEY, "[]"));
            JSONArray remaining = new JSONArray();
            for (int index = 0; index < items.length(); index++) {
                if (!targetId.equals(items.getJSONObject(index).optString("id"))) remaining.put(items.getJSONObject(index));
            }
            preferences.edit().putString(NotificationCaptureService.ITEMS_KEY, remaining.toString()).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not dismiss the detected debit.", error);
        }
    }

    @PluginMethod
    public void getDetectedDebits(PluginCall call) {
        SharedPreferences preferences = getContext().getSharedPreferences(
            NotificationCaptureService.PREFS_NAME,
            android.content.Context.MODE_PRIVATE
        );
        try {
            JSONArray items = new JSONArray(preferences.getString(NotificationCaptureService.ITEMS_KEY, "[]"));
            JSObject result = new JSObject();
            result.put("items", new JSArray(items.toString()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read detected debit notifications.", error);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences preferences = getContext().getSharedPreferences(
            NotificationCaptureService.PREFS_NAME,
            android.content.Context.MODE_PRIVATE
        );
        try {
            JSONArray items = new JSONArray(preferences.getString(NotificationCaptureService.ITEMS_KEY, "[]"));
            JSObject result = new JSObject();
            result.put("enabled", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
            result.put("detectedCount", items.length());
            result.put("items", new JSArray(items.toString()));
            if (items.length() > 0) {
                result.put("lastAmount", items.getJSONObject(0).optString("amount", null));
                result.put("lastDetectedAt", items.getJSONObject(0).optLong("detectedAt", 0));
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read notification status.", error);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open Android notification access settings.", error);
        }
    }
}
