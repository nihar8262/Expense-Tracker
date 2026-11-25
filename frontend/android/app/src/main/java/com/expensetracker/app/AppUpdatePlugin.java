package com.expensetracker.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "0" : info.versionName);
            result.put("versionCode", versionCode);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read the installed app version.", error);
        }
    }

    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url");
        if (url == null || (!url.startsWith("https://github.com/") && !url.startsWith("https://objects.githubusercontent.com/"))) {
            call.reject("The update download URL is invalid.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open the Android update download.", error);
        }
    }
}
