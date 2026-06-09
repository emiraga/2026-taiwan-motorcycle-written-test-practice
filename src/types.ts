export interface Question {
  number: number;
  question: string;
  options: string[];
  /** 1-based index of the correct option (1, 2, or 3). */
  correct: number;
  pictures?: string[];
  /** Path (under /public) to a video clip illustrating the question. */
  video_file?: string;
  /**
   * External video URL, embedded as an iframe. Used as a fallback when there is
   * no `video_file`, or when the local file fails to load.
   */
  video_url?: string;
}

export interface QuestionBank {
  questions: Question[];
}

/** A given answer: a 1-based option index, or "idk" for "I don't know". */
export type AnswerValue = number | "idk";

export interface Attempt {
  answer: AnswerValue;
  /** Whether the given answer was correct. "I don't know" is always incorrect. */
  correct: boolean;
  timestamp: number;
}

export interface QuestionProgress {
  attempts: Attempt[];
}

export interface BankProgress {
  /** Identifies which question bank these answers belong to. */
  bank: string;
  /** Keyed by question number. */
  answers: Record<number, QuestionProgress>;
}

export type FilterMode =
  | "all"
  | "unanswered"
  | "lastIncorrect"
  | "incorrectEver"
  | "srsDue";

export type SortMode =
  | "sequence"
  | "leastAnswered"
  | "spacedRepetition"
  | "random";

/** Tie-breaker applied within the primary sort. */
export type SecondarySortMode = "sequence" | "random";
