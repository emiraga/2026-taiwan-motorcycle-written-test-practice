import { describe, expect, it } from "vitest";

import type { Attempt, QuestionProgress } from "@/types";
import {
  computeSrsState,
  isSrsDue,
  SESSION_WINDOW_MS,
  sessionize,
  srsUrgency,
} from "@/lib/srs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed base time so cases read in absolute terms; value is arbitrary. */
const T0 = 1_700_000_000_000;

function attempt(timestamp: number, correct: boolean): Attempt {
  return { answer: correct ? 1 : 2, correct, timestamp };
}

function progress(...attempts: Attempt[]): QuestionProgress {
  return { attempts };
}

describe("sessionize", () => {
  it("returns nothing for no attempts", () => {
    expect(sessionize([])).toEqual([]);
  });

  it("keeps a lone attempt", () => {
    const a = attempt(T0, true);
    expect(sessionize([a])).toEqual([a]);
  });

  it("collapses attempts within the window, keeping the first outcome", () => {
    // A correct first answer followed by a wrong retry 1 minute later: the
    // session counts as the (correct) first attempt only.
    const first = attempt(T0, true);
    const retry = attempt(T0 + 60_000, false);
    expect(sessionize([first, retry])).toEqual([first]);
  });

  it("treats the window boundary as still the same session", () => {
    // diff === windowMs is not "> windowMs", so it does not open a new session.
    const first = attempt(T0, true);
    const edge = attempt(T0 + SESSION_WINDOW_MS, false);
    expect(sessionize([first, edge])).toEqual([first]);
  });

  it("anchors the window to the session start, not the previous attempt", () => {
    // a1 sits 0.8 windows after a0 (collapsed). a2 sits 0.7 windows after a1 —
    // which a *sliding* window would also collapse — but 1.5 windows after the
    // session start a0, so the anchored window opens a fresh session at a2.
    const a0 = attempt(T0, true);
    const a1 = attempt(T0 + 0.8 * SESSION_WINDOW_MS, false);
    const a2 = attempt(T0 + 1.5 * SESSION_WINDOW_MS, false);
    expect(sessionize([a0, a1, a2])).toEqual([a0, a2]);
  });
});

describe("computeSrsState", () => {
  it("returns null for a never-reviewed card", () => {
    expect(computeSrsState(progress())).toBeNull();
    expect(computeSrsState(undefined)).toBeNull();
  });

  it("schedules a first correct review 1 day out", () => {
    const state = computeSrsState(progress(attempt(T0, true)));
    expect(state).not.toBeNull();
    expect(state!.repetitions).toBe(1);
    expect(state!.intervalDays).toBe(1);
    expect(state!.ease).toBeCloseTo(2.6); // 2.5 + 0.1 for a grade-5 recall
    expect(state!.due).toBe(T0 + 1 * DAY_MS);
  });

  it("uses the fixed 6-day step on the second consecutive success", () => {
    const t2 = T0 + 2 * DAY_MS;
    const state = computeSrsState(
      progress(attempt(T0, true), attempt(t2, true)),
    );
    expect(state!.repetitions).toBe(2);
    expect(state!.intervalDays).toBe(6);
    expect(state!.ease).toBeCloseTo(2.7);
    expect(state!.due).toBe(t2 + 6 * DAY_MS);
  });

  it("multiplies by ease from the third success on", () => {
    // After two successes ease is 2.7 and the interval is 6, so the third
    // interval is round(6 * 2.7) = 16 days; ease then rises to 2.8.
    const t2 = T0 + 2 * DAY_MS;
    const t3 = t2 + 6 * DAY_MS;
    const state = computeSrsState(
      progress(attempt(T0, true), attempt(t2, true), attempt(t3, true)),
    );
    expect(state!.repetitions).toBe(3);
    expect(state!.intervalDays).toBe(16);
    expect(state!.ease).toBeCloseTo(2.8);
    expect(state!.due).toBe(t3 + 16 * DAY_MS);
  });

  it("resets repetitions and interval on a lapse", () => {
    // Correct then incorrect: a grade-2 lapse pulls ease down by 0.32 and sends
    // the card back to a 1-day interval.
    const t2 = T0 + 2 * DAY_MS;
    const state = computeSrsState(
      progress(attempt(T0, true), attempt(t2, false)),
    );
    expect(state!.repetitions).toBe(0);
    expect(state!.intervalDays).toBe(1);
    expect(state!.ease).toBeCloseTo(2.28); // 2.6 - 0.32
    expect(state!.due).toBe(t2 + 1 * DAY_MS);
  });

  it("never lets ease fall below the 1.3 floor", () => {
    // Five lapses would drive ease well below 1.3 unclamped; it must clamp.
    const attempts = Array.from({ length: 5 }, (_, i) =>
      attempt(T0 + i * 2 * DAY_MS, false),
    );
    const state = computeSrsState(progress(...attempts));
    expect(state!.ease).toBeCloseTo(1.3);
  });
});

describe("srsUrgency", () => {
  it("ranks never-reviewed cards first via Infinity", () => {
    expect(srsUrgency(progress(), T0)).toBe(Infinity);
  });

  it("is a unitless ratio: 1.0 exactly at the due moment", () => {
    // One correct review => 1-day interval; one day later the ratio is 1.
    const p = progress(attempt(T0, true));
    expect(srsUrgency(p, T0 + 1 * DAY_MS)).toBeCloseTo(1);
    expect(srsUrgency(p, T0 + 0.5 * DAY_MS)).toBeCloseTo(0.5); // not yet due
    expect(srsUrgency(p, T0 + 3 * DAY_MS)).toBeCloseTo(3); // overdue
  });
});

describe("isSrsDue", () => {
  it("treats never-reviewed cards as due", () => {
    expect(isSrsDue(progress(), T0)).toBe(true);
  });

  it("is not due before the scheduled time and due at/after it", () => {
    const p = progress(attempt(T0, true)); // due at T0 + 1 day
    expect(isSrsDue(p, T0)).toBe(false);
    expect(isSrsDue(p, T0 + 1 * DAY_MS)).toBe(true);
    expect(isSrsDue(p, T0 + 2 * DAY_MS)).toBe(true);
  });
});
