import type { BankProgress } from "@/types";

/** The question bank we are currently studying. */
export const BANK_NAME = "Written_Test_Question_Bank";

const STORAGE_KEY = `qbank:${BANK_NAME}`;

function emptyProgress(): BankProgress {
  return { bank: BANK_NAME, answers: {} };
}

export function loadProgress(): BankProgress {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyProgress();

  let parsed: BankProgress;
  try {
    parsed = JSON.parse(raw) as BankProgress;
  } catch (cause) {
    throw new Error(`Corrupted progress in localStorage key "${STORAGE_KEY}"`, {
      cause,
    });
  }

  if (parsed.bank !== BANK_NAME || typeof parsed.answers !== "object") {
    throw new Error(
      `Stored progress in "${STORAGE_KEY}" does not match bank "${BANK_NAME}"`,
    );
  }
  return parsed;
}

export function saveProgress(progress: BankProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
