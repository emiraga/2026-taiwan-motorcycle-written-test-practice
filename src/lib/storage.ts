import type { BankProgress } from "@/types";

function storageKey(bank: string): string {
  return `qbank:${bank}`;
}

function emptyProgress(bank: string): BankProgress {
  return { bank, answers: {} };
}

export function loadProgress(bank: string): BankProgress {
  const key = storageKey(bank);
  const raw = localStorage.getItem(key);
  if (!raw) return emptyProgress(bank);

  let parsed: BankProgress;
  try {
    parsed = JSON.parse(raw) as BankProgress;
  } catch (cause) {
    throw new Error(`Corrupted progress in localStorage key "${key}"`, {
      cause,
    });
  }

  if (parsed.bank !== bank || typeof parsed.answers !== "object") {
    throw new Error(
      `Stored progress in "${key}" does not match bank "${bank}"`,
    );
  }
  return parsed;
}

export function saveProgress(progress: BankProgress): void {
  localStorage.setItem(storageKey(progress.bank), JSON.stringify(progress));
}
