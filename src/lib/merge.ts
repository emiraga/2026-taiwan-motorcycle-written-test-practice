import type { Attempt, BankProgress, QuestionProgress } from "../types";

export function isBankProgress(value: unknown): value is BankProgress {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.bank === "string" &&
    typeof v.answers === "object" &&
    v.answers !== null
  );
}

/** Parse and validate a previously exported progress file. */
export function parseProgress(raw: string): BankProgress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error("Import failed: file is not valid JSON", { cause });
  }
  if (!isBankProgress(parsed)) {
    throw new Error("Import failed: file is not a valid progress export");
  }
  return parsed;
}

/** Uniquely identifies a single attempt, used to deduplicate on import. */
function attemptKey(a: Attempt): string {
  return `${a.timestamp}:${a.answer}:${a.correct}`;
}

/**
 * Merge `incoming` progress into `current`, deduplicating attempts so that
 * re-importing the same export is a no-op. Throws if the two refer to
 * different banks.
 */
export function mergeProgress(
  current: BankProgress,
  incoming: BankProgress,
): BankProgress {
  if (incoming.bank !== current.bank) {
    throw new Error(
      `Import failed: file is for bank "${incoming.bank}", ` +
        `but the current bank is "${current.bank}".`,
    );
  }

  const answers: Record<number, QuestionProgress> = {};
  for (const [num, qp] of Object.entries(current.answers)) {
    answers[Number(num)] = { attempts: [...qp.attempts] };
  }

  for (const [num, qp] of Object.entries(incoming.answers)) {
    const key = Number(num);
    const existing = answers[key]?.attempts ?? [];
    const seen = new Set(existing.map(attemptKey));
    const merged = [...existing];
    for (const a of qp.attempts) {
      const k = attemptKey(a);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(a);
      }
    }
    merged.sort((x, y) => x.timestamp - y.timestamp);
    answers[key] = { attempts: merged };
  }

  return { bank: current.bank, answers };
}
