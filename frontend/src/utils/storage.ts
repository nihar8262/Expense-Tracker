import type { CategoryOption, PendingSubmission } from "../types";

const PENDING_SUBMISSION_STORAGE_KEY = "expense-tracker.pending-submission";
const CUSTOM_CATEGORY_STORAGE_KEY_PREFIX = "expense-tracker.custom-categories";

function getCustomCategoryStorageKey(userId: string): string {
  return `${CUSTOM_CATEGORY_STORAGE_KEY_PREFIX}.${userId}`;
}

export function readCustomCategories(userId: string): CategoryOption[] {
  const storedValue = window.localStorage.getItem(getCustomCategoryStorageKey(userId));

  if (!storedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedValue) as CategoryOption[];
    return parsed.filter((item) => Boolean(item.label) && Boolean(item.icon)).map((item) => ({ ...item, isCustom: true }));
  } catch {
    window.localStorage.removeItem(getCustomCategoryStorageKey(userId));
    return [];
  }
}

export function writeCustomCategories(userId: string, categories: CategoryOption[]) {
  window.localStorage.setItem(getCustomCategoryStorageKey(userId), JSON.stringify(categories));
}

export function clearCustomCategories(userId: string) {
  window.localStorage.removeItem(getCustomCategoryStorageKey(userId));
}

export function readPendingSubmission(): PendingSubmission | null {
  const storedValue = window.localStorage.getItem(PENDING_SUBMISSION_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as PendingSubmission;
  } catch {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return null;
  }
}

export function writePendingSubmission(submission: PendingSubmission | null) {
  if (!submission) {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify(submission));
}
