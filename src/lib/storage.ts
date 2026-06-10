import type { BankProgress, FilterMode, SecondarySortMode, SortMode } from "@/types";
import { BANKS, DEFAULT_BANK } from "@/lib/banks";
import { isBankProgress } from "@/lib/merge";
import {
  DEFAULT_FILTER,
  DEFAULT_SECONDARY_SORT,
  DEFAULT_SORT,
  FILTER_OPTIONS,
  SECONDARY_SORT_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/viewSettings";

// The pure, DOM-free progress helpers live in `merge.ts` so the Cloudflare
// Pages Function can import them too. Re-exported here so existing callers that
// import from `@/lib/storage` keep working.
export { mergeProgress, parseProgress } from "@/lib/merge";

function storageKey(bank: string): string {
  return `qbank:${bank}`;
}

const LAST_BANK_KEY = "qbank:lastBank";
const SYNC_SECRET_KEY = "qbank:syncSecret";
const FILTER_KEY = "qbank:filter";
const SORT_KEY = "qbank:sort";
const SECONDARY_SORT_KEY = "qbank:secondarySort";

/**
 * Reads a remembered choice from localStorage, falling back to `fallback` when
 * nothing is stored or the stored value is no longer one of `allowed`.
 */
function loadChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const stored = localStorage.getItem(key);
  return stored && (allowed as readonly string[]).includes(stored)
    ? (stored as T)
    : fallback;
}

function saveChoice(key: string, value: string): void {
  localStorage.setItem(key, value);
}

/** The shared sync passphrase for this device, or null if not yet set. */
export function loadSyncSecret(): string | null {
  return localStorage.getItem(SYNC_SECRET_KEY);
}

export function saveSyncSecret(secret: string): void {
  localStorage.setItem(SYNC_SECRET_KEY, secret);
}

/** The most recently selected bank, or DEFAULT_BANK if none/invalid is stored. */
export function loadLastBank(): string {
  return loadChoice(
    LAST_BANK_KEY,
    BANKS.map((b) => b.id),
    DEFAULT_BANK,
  );
}

export function saveLastBank(bank: string): void {
  saveChoice(LAST_BANK_KEY, bank);
}

/** The most recently used filter, or its default if none/invalid is stored. */
export function loadFilter(): FilterMode {
  return loadChoice(
    FILTER_KEY,
    FILTER_OPTIONS.map((o) => o.value),
    DEFAULT_FILTER,
  );
}

export function saveFilter(filter: FilterMode): void {
  saveChoice(FILTER_KEY, filter);
}

/** The most recently used sort, or its default if none/invalid is stored. */
export function loadSort(): SortMode {
  return loadChoice(
    SORT_KEY,
    SORT_OPTIONS.map((o) => o.value),
    DEFAULT_SORT,
  );
}

export function saveSort(sort: SortMode): void {
  saveChoice(SORT_KEY, sort);
}

/** The most recently used tie-breaker sort, or its default if none/invalid. */
export function loadSecondarySort(): SecondarySortMode {
  return loadChoice(
    SECONDARY_SORT_KEY,
    SECONDARY_SORT_OPTIONS.map((o) => o.value),
    DEFAULT_SECONDARY_SORT,
  );
}

export function saveSecondarySort(sort: SecondarySortMode): void {
  saveChoice(SECONDARY_SORT_KEY, sort);
}

function emptyProgress(bank: string): BankProgress {
  return { bank, answers: {} };
}

export function loadProgress(bank: string): BankProgress {
  const key = storageKey(bank);
  const raw = localStorage.getItem(key);
  if (!raw) return emptyProgress(bank);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Corrupted progress in localStorage key "${key}"`, {
      cause,
    });
  }

  if (!isBankProgress(parsed) || parsed.bank !== bank) {
    throw new Error(
      `Stored progress in "${key}" does not match bank "${bank}"`,
    );
  }
  return parsed;
}

export function saveProgress(progress: BankProgress): void {
  localStorage.setItem(storageKey(progress.bank), JSON.stringify(progress));
}

/** Builds an export file name: `<bank>_YYYY-MM-DD_HH-MM-SS.json`. */
export function exportFileName(bank: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${bank}_${stamp}.json`;
}
