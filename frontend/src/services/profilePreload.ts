import type { User } from "firebase/auth";
import type { BankAccount, FeedbackRecord, ReminderPreferences } from "../types";
import {
  getReminderPreferences,
  listBankAccounts,
  listTokens,
  listUserFeedbacks,
  type Token
} from "./api";

export type ProfilePreloadData = {
  bankAccounts: BankAccount[];
  feedbacks: FeedbackRecord[];
  tokens: Token[];
  preferences: ReminderPreferences | null;
  cachedAt: string;
};

const key = (userId: string) => `finance-space.android-profile-preload.${userId}`;

export function readProfilePreload(userId: string): ProfilePreloadData | null {
  try {
    const value = window.localStorage.getItem(key(userId));
    return value ? JSON.parse(value) as ProfilePreloadData : null;
  } catch {
    return null;
  }
}

export function writeProfilePreload(userId: string, update: Partial<ProfilePreloadData>) {
  const current = readProfilePreload(userId);
  const next: ProfilePreloadData = {
    bankAccounts: update.bankAccounts ?? current?.bankAccounts ?? [],
    feedbacks: update.feedbacks ?? current?.feedbacks ?? [],
    tokens: update.tokens ?? current?.tokens ?? [],
    preferences: update.preferences ?? current?.preferences ?? null,
    cachedAt: new Date().toISOString()
  };
  window.localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}

export async function preloadAndroidProfile(user: User) {
  const [banks, feedbacks, tokens, preferences] = await Promise.allSettled([
    listBankAccounts(user),
    listUserFeedbacks(user),
    listTokens(user),
    getReminderPreferences(user)
  ]);
  return writeProfilePreload(user.uid, {
    bankAccounts: banks.status === "fulfilled" ? banks.value : undefined,
    feedbacks: feedbacks.status === "fulfilled" ? feedbacks.value : undefined,
    tokens: tokens.status === "fulfilled" ? tokens.value : undefined,
    preferences: preferences.status === "fulfilled" ? preferences.value : undefined
  });
}
