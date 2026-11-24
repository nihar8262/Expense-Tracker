import { registerPlugin } from "@capacitor/core";

export type NotificationReaderStatus = {
  enabled: boolean;
  detectedCount: number;
  lastAmount?: string | null;
  lastDetectedAt?: number | null;
  items?: DetectedDebit[];
};

export type DetectedDebit = {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  amount: string;
  detectedAt: number;
};

type NotificationReaderPlugin = {
  getStatus(): Promise<NotificationReaderStatus>;
  getDetectedDebits(): Promise<{ items: DetectedDebit[] }>;
  deleteDetectedDebit(input: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};

const NotificationReader = registerPlugin<NotificationReaderPlugin>("NotificationReader");

export function getNotificationReaderStatus() {
  return NotificationReader.getStatus();
}

export async function getDetectedDebits() {
  return (await NotificationReader.getDetectedDebits()).items;
}

export function deleteDetectedDebit(id: string) {
  return NotificationReader.deleteDetectedDebit({ id });
}

export function openNotificationReaderSettings() {
  return NotificationReader.openSettings();
}
