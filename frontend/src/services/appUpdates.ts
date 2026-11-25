import { registerPlugin } from "@capacitor/core";

const RELEASE_API_URL = "https://api.github.com/repos/nihar8262/Expense-Tracker/releases/latest";

type NativeAppUpdatePlugin = {
  getInstalledVersion(): Promise<{ versionName: string; versionCode: number }>;
  openDownload(options: { url: string }): Promise<void>;
};

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

export type AppUpdateInfo = {
  installedVersion: string;
  installedVersionCode: number;
  latestVersion: string;
  downloadUrl: string;
  updateAvailable: boolean;
};

const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>("AppUpdate");

function versionParts(value: string) {
  return value.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, installed: string) {
  const candidateParts = versionParts(candidate);
  const installedParts = versionParts(installed);
  const length = Math.max(candidateParts.length, installedParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (installedParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const installed = await NativeAppUpdate.getInstalledVersion();
  const response = await fetch(RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(response.status === 403
      ? "GitHub temporarily limited update checks. Please try again later."
      : "Could not check the latest Android release.");
  }

  const release = await response.json() as GithubRelease;
  const latestVersion = String(release.tag_name ?? "").replace(/^v/i, "");
  if (!latestVersion) throw new Error("The latest Android release has no version tag.");
  const apkAsset = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith(".apk"));
  const downloadUrl = apkAsset?.browser_download_url ?? release.html_url;
  if (!downloadUrl) throw new Error("The latest Android release has no APK download.");

  return {
    installedVersion: installed.versionName,
    installedVersionCode: installed.versionCode,
    latestVersion,
    downloadUrl,
    updateAvailable: isNewerVersion(latestVersion, installed.versionName)
  };
}

export function openAppUpdate(downloadUrl: string) {
  return NativeAppUpdate.openDownload({ url: downloadUrl });
}
