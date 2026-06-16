import type { Attempt, QuestionProgress } from "@/types";

export function attemptsOf(progress?: QuestionProgress): Attempt[] {
  return progress?.attempts ?? [];
}

export function lastAttempt(progress?: QuestionProgress): Attempt | undefined {
  return attemptsOf(progress).at(-1);
}

export function isUnanswered(progress?: QuestionProgress): boolean {
  return attemptsOf(progress).length === 0;
}

export function isLastIncorrect(progress?: QuestionProgress): boolean {
  const last = lastAttempt(progress);
  return last !== undefined && !last.correct;
}

export function wasEverIncorrect(progress?: QuestionProgress): boolean {
  return attemptsOf(progress).some((a) => !a.correct);
}

/** Whether the question was answered incorrectly more than once. */
export function wasIncorrectMultipleTimes(
  progress?: QuestionProgress,
): boolean {
  return attemptsOf(progress).filter((a) => !a.correct).length > 1;
}

export function timesAnswered(progress?: QuestionProgress): number {
  return attemptsOf(progress).length;
}

/**
 * Whether the last three answers were all correct, which requires at least
 * three attempts. Used to single out "mastered" questions so they can be
 * filtered out when reviewing.
 */
export function lastThreeAllCorrect(progress?: QuestionProgress): boolean {
  const attempts = attemptsOf(progress);
  return attempts.length >= 3 && attempts.slice(-3).every((a) => a.correct);
}

/**
 * Whether the question was answered at least once on the same local calendar
 * day as `now`. `now` is passed in (rather than read here) so a whole filtered
 * snapshot shares one consistent "today".
 */
export function answeredToday(
  progress: QuestionProgress | undefined,
  now: number,
): boolean {
  const today = new Date(now);
  return attemptsOf(progress).some((a) => {
    const d = new Date(a.timestamp);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  });
}
