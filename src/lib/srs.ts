import type { Attempt, QuestionProgress } from "@/types";
import { attemptsOf } from "@/lib/progress";

/**
 * A hand-rolled spaced-repetition scheduler based on the classic SM-2
 * algorithm (the one behind the original SuperMemo, and the ancestor of
 * Anki's default scheduler).
 *
 * The idea: every time you review a card you get a grade. Cards you keep
 * getting right have their next review pushed further into the future
 * (the interval grows); cards you get wrong are reset to be seen again soon.
 * Sorting questions by their resulting "due" date surfaces the ones the
 * algorithm thinks you're about to forget.
 *
 * Our quiz only produces a *binary* signal (correct / incorrect), whereas
 * SM-2 expects a 0–5 grade. We map:
 *   - correct  -> grade 5 (a confident, easy recall)
 *   - incorrect / "idk" -> grade 2 (a lapse; anything < 3 fails the card)
 * This keeps the EF (easiness) maths intact while only ever feeding it the
 * two grades we can actually observe.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Attempts closer together in time than this are treated as a single review
 * (the first attempt's outcome wins). This stops a "retry until correct"
 * burst within one sitting from being counted as several reviews, which would
 * wildly distort the schedule. The window is anchored to the first attempt of
 * each session, so it can't slide indefinitely.
 */
export const SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/** SM-2 grades we feed the scheduler for our two observable outcomes. */
const GRADE_CORRECT = 5;
const GRADE_INCORRECT = 2;

/** SM-2 easiness factor starts here and is never allowed below MIN_EASE. */
const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;

export interface SrsState {
  /** Easiness factor: how fast the interval grows on success. >= MIN_EASE. */
  ease: number;
  /** Count of consecutive successful reviews; resets to 0 on a lapse. */
  repetitions: number;
  /** Current interval, in days, between the last review and the next one. */
  intervalDays: number;
  /** Timestamp (ms) of the last review that was scheduled. */
  lastReviewed: number;
  /** Timestamp (ms) at which this card next becomes due. */
  due: number;
}

/**
 * Collapse a card's raw attempts into one review per study session.
 *
 * Attempts are assumed to be sorted ascending by timestamp (which is how
 * storage keeps them after merge). We walk them in order; the first attempt
 * opens a session and its outcome represents the whole session. Any further
 * attempts within SESSION_WINDOW_MS of that opening attempt are discarded.
 * The next attempt outside the window opens a fresh session.
 */
export function sessionize(
  attempts: Attempt[],
  windowMs = SESSION_WINDOW_MS,
): Attempt[] {
  const sessions: Attempt[] = [];
  let sessionStart = -Infinity;
  for (const attempt of attempts) {
    if (attempt.timestamp - sessionStart > windowMs) {
      sessions.push(attempt);
      sessionStart = attempt.timestamp;
    }
  }
  return sessions;
}

/**
 * Replay a card's review history through SM-2 and return its scheduling
 * state, or `null` if the card has never been reviewed (a "new" card).
 */
export function computeSrsState(progress?: QuestionProgress): SrsState | null {
  const reviews = sessionize(attemptsOf(progress));
  if (reviews.length === 0) return null;

  let ease = INITIAL_EASE;
  let repetitions = 0;
  let intervalDays = 0;
  let lastReviewed = reviews[0].timestamp;

  for (const review of reviews) {
    const grade = review.correct ? GRADE_CORRECT : GRADE_INCORRECT;

    if (grade >= 3) {
      // Successful recall: lengthen the interval.
      if (repetitions === 0) intervalDays = 1;
      else if (repetitions === 1) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * ease);
      repetitions += 1;
    } else {
      // Lapse: send the card back to the start of the queue.
      repetitions = 0;
      intervalDays = 1;
    }

    // SM-2 easiness update. A perfect grade (5) nudges EF up by 0.1; lower
    // grades pull it down. EF is clamped so intervals can't collapse to zero.
    ease = Math.max(
      MIN_EASE,
      ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
    );
    lastReviewed = review.timestamp;
  }

  return {
    ease,
    repetitions,
    intervalDays,
    lastReviewed,
    due: lastReviewed + intervalDays * DAY_MS,
  };
}

/**
 * Sort key for spaced-repetition ordering, expressed as an "overdue ratio":
 *
 *     urgency = (now - lastReviewed) / intervalDays
 *
 * ── SPECIAL PURPOSE — read before reusing this ──────────────────────────────
 * This is deliberately NOT the plain `due` timestamp a normal SRS queue uses.
 * A due-date sort only really distinguishes "due" from "not due" by a calendar
 * cutoff; once your due cards run out it gives a poor ordering for *continuing*
 * to study ahead of schedule. The overdue ratio instead measures how far a
 * card has decayed *as a fraction of its own interval*, which stays meaningful
 * for cards that are not yet due:
 *
 *     ratio >= 1  -> at or past its scheduled review (due / overdue)
 *     ratio  < 1  -> not yet due; closer to 1 means more decayed
 *
 * Sorting by this value DESCENDING (most-decayed first) therefore yields one
 * smooth ranking across both due and not-due cards — exactly what you want when
 * you've cleared the due queue but still want to drill the next-weakest
 * material. It is a cheap stand-in for FSRS's "retrievability" (the probability
 * you'd recall the card right now); we don't model a true forgetting curve,
 * just the linear fraction of the interval elapsed.
 *
 * Two caller contracts:
 *   1. Pass a single `now` captured once per sort, so the ranking is stable
 *      while the comparator runs.
 *   2. Never-reviewed ("new") cards return Infinity so they rank first. Because
 *      two Infinities are not ordered, compare with `a !== b ? b - a : tie`
 *      rather than a bare `b - a` (Infinity − Infinity is NaN, which would
 *      corrupt the sort).
 * ────────────────────────────────────────────────────────────────────────────
 */
export function srsUrgency(
  progress: QuestionProgress | undefined,
  now: number,
): number {
  const state = computeSrsState(progress);
  if (state === null) return Infinity;
  // Elapsed time is converted to days so numerator and denominator share units
  // and the result is a true unitless ratio (1.0 == exactly due). intervalDays
  // is always >= 1 for a reviewed card, so this never divides by 0.
  const elapsedDays = (now - state.lastReviewed) / DAY_MS;
  return elapsedDays / state.intervalDays;
}

/**
 * Whether a card is due for review *now* under the SRS schedule. New
 * (never-reviewed) cards count as due so they're never hidden from study.
 * This is the boolean cutoff (`urgency >= 1`) that the "due" filter applies;
 * the spaced-repetition *sort* instead ranks by the continuous urgency above.
 */
export function isSrsDue(
  progress: QuestionProgress | undefined,
  now: number,
): boolean {
  const state = computeSrsState(progress);
  return state === null || now >= state.due;
}
