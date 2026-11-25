import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { BellRing, Database, Download, History, LoaderCircle, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { ModalFrame, SurfaceCard } from "./ui";
import { FilterDropdown } from "./FilterDropdown";
import {
  enableDeviceStorage,
  getDeviceSyncHistory,
  getDeviceStorageStatus,
  syncServerDataToDevice,
  type DeviceStorageStatus,
  type DeviceSyncHistoryEntry,
  type DeviceSyncStage
} from "../services/localDeviceStore";
import {
  getNotificationReaderStatus,
  openNotificationReaderSettings,
  type NotificationReaderStatus
} from "../services/notificationReader";
import {
  getSystemNotificationPermission,
  requestSystemNotificationPermission
} from "../services/systemNotifications";
import { checkForAppUpdate, openAppUpdate, type AppUpdateInfo } from "../services/appUpdates";

type SettingRowProps = {
  icon: typeof Smartphone;
  title: string;
  description: ReactNode;
  status: string;
  action: string;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
};

function SettingRow({ icon: Icon, title, description, status, action, disabled = false, busy = false, onClick }: SettingRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-white/70 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {status}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onClick}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-xs font-semibold text-secondary transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        {action}
      </button>
    </div>
  );
}

const initialStatus: DeviceStorageStatus = {
  enabled: false,
  lastSyncedAt: null,
  expenseCount: 0,
  budgetCount: 0,
  walletCount: 0,
  pendingChangeCount: 0
  ,lastSyncStatus: null
};

export function AndroidAppSettings({ currentUser }: { currentUser: User }) {
  const [storageStatus, setStorageStatus] = useState(initialStatus);
  const [notificationStatus, setNotificationStatus] = useState<NotificationReaderStatus>({ enabled: false, detectedCount: 0 });
  const [systemNotificationsEnabled, setSystemNotificationsEnabled] = useState(false);
  const [busyAction, setBusyAction] = useState<"notifications" | "storage" | "sync" | "updates" | null>(null);
  const [message, setMessage] = useState("");
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [syncStage, setSyncStage] = useState<DeviceSyncStage | null>(null);
  const [syncHistory, setSyncHistory] = useState<DeviceSyncHistoryEntry[]>([]);
  const [isSyncHistoryOpen, setIsSyncHistoryOpen] = useState(false);
  const [syncHistoryStatus, setSyncHistoryStatus] = useState<"all" | DeviceSyncHistoryEntry["status"]>("all");
  const [syncHistoryTime, setSyncHistoryTime] = useState<"all" | "day" | "week" | "month">("all");
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void getDeviceStorageStatus(currentUser.uid)
      .then((status) => {
        if (active) setStorageStatus(status);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Could not inspect local storage.");
      });
    void getDeviceSyncHistory(currentUser.uid).then((entries) => {
      if (active) setSyncHistory(entries);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getNotificationReaderStatus()
        .then((status) => {
          if (active) {
            setNotificationStatus(status);
            if (status.items?.length) window.dispatchEvent(new CustomEvent("detected-debits", { detail: status.items }));
          }
        })
        .catch((error) => {
          if (active) setMessage(error instanceof Error ? error.message : "Could not inspect notification access.");
        });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    void getSystemNotificationPermission().then(({ granted }) => setSystemNotificationsEnabled(granted)).catch(() => undefined);
  }, []);

  async function handleSystemNotificationPermission() {
    setBusyAction("notifications");
    try {
      const result = await requestSystemNotificationPermission();
      setSystemNotificationsEnabled(result.granted);
      setMessage(result.granted
        ? "Android notifications are enabled for budgets, payments, shared wallets, and loans."
        : "Notification permission was not granted. You can enable it later in Android app settings.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request notification permission.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNotificationSetup() {
    setBusyAction("notifications");
    setMessage("Enable Finance Space on the Android notification access screen, then return here.");
    try {
      await openNotificationReaderSettings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open notification access settings.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnableStorage() {
    setBusyAction("storage");
    setMessage("");
    try {
      setStorageStatus(await enableDeviceStorage(currentUser.uid));
      setMessage("Private local storage is ready. No data was synced automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable local storage.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleManualSync() {
    setBusyAction("sync");
    setMessage("");
    try {
      setStorageStatus(await syncServerDataToDevice(currentUser, setSyncStage));
      setClockNow(Date.now());
      setSyncHistory(await getDeviceSyncHistory(currentUser.uid));
      window.dispatchEvent(new CustomEvent("expense-added"));
      window.dispatchEvent(new CustomEvent("device-sync-complete"));
      setMessage("Manual download completed. Automatic sync remains off.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Manual sync failed.");
      setSyncHistory(await getDeviceSyncHistory(currentUser.uid).catch(() => []));
    } finally {
      setSyncStage(null);
      setBusyAction(null);
    }
  }

  async function openSyncHistory() {
    setSyncHistory(await getDeviceSyncHistory(currentUser.uid, 100).catch(() => []));
    setIsSyncHistoryOpen(true);
  }

  async function handleAppUpdate() {
    if (appUpdate?.updateAvailable) {
      await openAppUpdate(appUpdate.downloadUrl).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not open the app update.");
      });
      return;
    }
    setBusyAction("updates");
    setMessage("");
    try {
      const update = await checkForAppUpdate();
      setAppUpdate(update);
      setMessage(update.updateAvailable
        ? `Android v${update.latestVersion} is available. Download it to update this installation without clearing local data.`
        : `Expense Tracker v${update.installedVersion} is the latest available version.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check for app updates.");
    } finally {
      setBusyAction(null);
    }
  }

  const lastSyncLabel = (() => {
    if (!storageStatus.lastSyncedAt) return "Never";
    const syncedAt = new Date(storageStatus.lastSyncedAt);
    const elapsedSeconds = Math.max(0, Math.floor((clockNow - syncedAt.getTime()) / 1000));
    if (elapsedSeconds < 15) return "Just now";
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
    return syncedAt.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  })();
  const syncStageLabel: Record<DeviceSyncStage, string> = {
    preparing: "Preparing local data...",
    uploading: "Uploading pending changes...",
    downloading: "Downloading current server data...",
    saving: "Saving the verified device copy...",
    complete: "Sync complete"
  };
  const filteredSyncHistory = useMemo(() => {
    const timeWindow = syncHistoryTime === "day"
      ? 24 * 60 * 60 * 1000
      : syncHistoryTime === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : syncHistoryTime === "month"
          ? 30 * 24 * 60 * 60 * 1000
          : null;
    const cutoff = timeWindow === null ? null : clockNow - timeWindow;
    return syncHistory.filter((entry) => {
      if (syncHistoryStatus !== "all" && entry.status !== syncHistoryStatus) return false;
      return cutoff === null || new Date(entry.startedAt).getTime() >= cutoff;
    });
  }, [clockNow, syncHistory, syncHistoryStatus, syncHistoryTime]);

  return (
    <>
    <SurfaceCard className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold tracking-tight text-ink sm:text-base">Android App Settings</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              This device
            </span>
          </div>
          <p className="text-xs leading-5 text-muted sm:text-sm">
            Manage notification reading, manual synchronization, and data stored on this Android device.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <SettingRow
          icon={Download}
          title="App updates"
          description={appUpdate?.updateAvailable
            ? `Android v${appUpdate.latestVersion} is ready to download. Android will verify the signature before updating this app.`
            : appUpdate
              ? `Installed version ${appUpdate.installedVersion}. No newer GitHub release was found.`
              : "Check your installed version against the latest signed APK published on GitHub Releases."}
          status={appUpdate?.updateAvailable ? "Available" : appUpdate ? "Up to date" : "Manual"}
          action={appUpdate?.updateAvailable ? `Download v${appUpdate.latestVersion}` : "Check now"}
          busy={busyAction === "updates"}
          onClick={() => void handleAppUpdate()}
        />
        <SettingRow
          icon={BellRing}
          title="Android app notifications"
          description="Show budget alerts, bill reminders, shared-wallet invitations, loan events, and repayments in the Android notification tray."
          status={systemNotificationsEnabled ? "On" : "Off"}
          action={systemNotificationsEnabled ? "Enabled" : "Enable"}
          disabled={systemNotificationsEnabled}
          busy={busyAction === "notifications"}
          onClick={handleSystemNotificationPermission}
        />
        <SettingRow
          icon={BellRing}
          title="Read transaction notifications"
          description={notificationStatus.enabled
            ? <>
                <span className="font-semibold text-emerald-600">
                  {notificationStatus.detectedCount} debit notification{notificationStatus.detectedCount === 1 ? "" : "s"}
                </span>
                {` detected locally${notificationStatus.lastAmount ? `; latest amount ₹${notificationStatus.lastAmount}` : ""}. No expense is added automatically.`}
              </>
            : "Detect debit notifications from banking and payment apps after you explicitly grant Android notification access."}
          status={notificationStatus.enabled ? "On" : "Off"}
          action={notificationStatus.enabled ? "Manage access" : "Set up"}
          busy={busyAction === "notifications"}
          onClick={handleNotificationSetup}
        />
        <SettingRow
          icon={RefreshCw}
          title="Manual data sync"
          description={storageStatus.pendingChangeCount > 0
            ? <>{storageStatus.pendingChangeCount} local change{storageStatus.pendingChangeCount === 1 ? "" : "s"} waiting. Sync uploads them, then downloads a fresh copy. Last sync: <span className="font-semibold text-emerald-600">{lastSyncLabel}</span>.</>
            : storageStatus.lastSyncedAt
              ? <>No local changes are waiting. Sync again to check for shared-wallet, invitation, and linked-loan changes. Last completed sync: <span className="font-semibold text-emerald-600">{lastSyncLabel}</span>.</>
              : "No sync has run yet. Sync downloads your current server data while automatic sync remains off."}
          status={storageStatus.lastSyncStatus === "failed" ? "Failed" : storageStatus.lastSyncedAt ? "Up to date" : "Not synced"}
          action={storageStatus.lastSyncedAt ? "Sync again" : "Sync now"}
          disabled={!storageStatus.enabled}
          busy={busyAction === "sync"}
          onClick={handleManualSync}
        />
        <button
          type="button"
          onClick={() => void openSyncHistory()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          View sync history
        </button>
        {busyAction === "sync" && syncStage ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-secondary">
              <span>{syncStageLabel[syncStage]}</span>
              <span>Manual only</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${({ preparing: 15, uploading: 40, downloading: 68, saving: 90, complete: 100 } as Record<DeviceSyncStage, number>)[syncStage]}%` }}
              />
            </div>
          </div>
        ) : null}
        <SettingRow
          icon={Database}
          title="Local device storage"
          description={storageStatus.enabled
            ? `${storageStatus.expenseCount} expenses, ${storageStatus.budgetCount} budgets, and ${storageStatus.walletCount} wallet summaries stored on this device.`
            : "Create a private SQLite database for this signed-in account. Enabling it does not start synchronization."}
          status={storageStatus.enabled ? "Ready" : "Not enabled"}
          action={storageStatus.enabled ? "Enabled" : "Enable"}
          disabled={storageStatus.enabled}
          busy={busyAction === "storage"}
          onClick={handleEnableStorage}
        />
        <SettingRow
          icon={ShieldCheck}
          title="Device security"
          description="Protect locally stored data with this device's screen lock or biometrics."
          status="Coming next"
          action="Configure"
          disabled
        />
      </div>

      {message ? (
        <p className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-secondary" role="status">
          {message}
        </p>
      ) : null}

      <p className="rounded-xl bg-primary/5 px-3 py-2.5 text-[11px] leading-5 text-secondary">
        These controls belong only to this phone. They are never shown in the website settings and do not enable automatic synchronization.
      </p>
    </SurfaceCard>

    {isSyncHistoryOpen ? (
      <ModalFrame
        onClose={() => setIsSyncHistoryOpen(false)}
        className="flex h-[82vh] max-h-[760px] max-w-2xl flex-col overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink sm:text-base">Manual sync history</h2>
              <p className="text-[11px] text-muted">Stored privately on this device</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSyncHistoryOpen(false)}
            aria-label="Close sync history"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-white text-muted transition hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--border)] bg-zinc-50/70 px-4 py-3 sm:gap-3 sm:px-5">
          <FilterDropdown
            label="Time"
            value={syncHistoryTime}
            onChange={(value) => setSyncHistoryTime(value as typeof syncHistoryTime)}
            searchable={false}
            options={[
              { value: "all", label: "All time" },
              { value: "day", label: "Last 24 hours" },
              { value: "week", label: "Last 7 days" },
              { value: "month", label: "Last 30 days" }
            ]}
          />
          <FilterDropdown
            label="Result"
            value={syncHistoryStatus}
            onChange={(value) => setSyncHistoryStatus(value as typeof syncHistoryStatus)}
            searchable={false}
            align="right"
            options={[
              { value: "all", label: "All results" },
              { value: "success", label: "Success" },
              { value: "unconfirmed", label: "Verify" },
              { value: "failed", label: "Failed" }
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredSyncHistory.length > 0 ? (
            <div className="space-y-2">
              {filteredSyncHistory.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-zinc-50/80 px-3.5 py-3 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{new Date(entry.startedAt).toLocaleString()}</p>
                    <p className="mt-0.5 text-muted">
                      {entry.status === "success"
                        ? `${entry.uploadedCount} uploaded · ${entry.downloadedCount} downloaded`
                        : entry.message || "Sync did not complete"}
                    </p>
                  </div>
                  <span className={entry.status === "success" ? "shrink-0 font-bold capitalize text-emerald-600" : entry.status === "failed" ? "shrink-0 font-bold capitalize text-red-600" : "shrink-0 font-bold text-amber-600"}>
                    {entry.status === "unconfirmed" ? "Verify" : entry.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-zinc-50/60 px-5 text-center">
              <History className="mb-3 h-6 w-6 text-primary/70" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">No matching syncs</p>
              <p className="mt-1 text-xs leading-5 text-muted">Try another time range or result filter.</p>
            </div>
          )}
        </div>
      </ModalFrame>
    ) : null}
    </>
  );
}

