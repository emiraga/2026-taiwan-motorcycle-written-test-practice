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

export function timesAnswered(progress?: QuestionProgress): number {
  return attemptsOf(progress).length;
}
