import type { BankProgress } from "@/types";
import { BANKS, DEFAULT_BANK } from "@/lib/banks";
import { isBankProgress } from "@/lib/merge";

// The pure, DOM-free progress helpers live in `merge.ts` so the Cloudflare
// Pages Function can import them too. Re-exported here so existing callers that
// import from `@/lib/storage` keep working.
export { mergeProgress, parseProgress } from "@/lib/merge";

function storageKey(bank: string): string {
  return `qbank:${bank}`;
}

const LAST_BANK_KEY = "qbank:lastBank";
const SYNC_SECRET_KEY = "qbank:syncSecret";

/** The shared sync passphrase for this device, or null if not yet set. */
export function loadSyncSecret(): string | null {
  return localStorage.getItem(SYNC_SECRET_KEY);
}

export function saveSyncSecret(secret: string): void {
  localStorage.setItem(SYNC_SECRET_KEY, secret);
}

/** The most recently selected bank, or DEFAULT_BANK if none/invalid is stored. */
export function loadLastBank(): string {
  const stored = localStorage.getItem(LAST_BANK_KEY);
  if (stored && BANKS.some((b) => b.id === stored)) return stored;
  return DEFAULT_BANK;
}

export function saveLastBank(bank: string): void {
  localStorage.setItem(LAST_BANK_KEY, bank);
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
