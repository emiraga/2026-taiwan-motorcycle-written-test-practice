import type {
  FilterMode,
  SecondaryFilterMode,
  SecondarySortMode,
  SortMode,
} from "@/types";

/** A single `<option>` in one of the filter/sort dropdowns. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const FILTER_OPTIONS: SelectOption<FilterMode>[] = [
  { value: "all", label: "All questions" },
  { value: "unanswered", label: "Unanswered questions" },
  { value: "lastIncorrect", label: "Last answer incorrect" },
  { value: "incorrectEver", label: "Answered incorrect at any time" },
  { value: "incorrectMultiple", label: "Answered incorrect multiple times" },
  { value: "srsDue", label: "Due for review (spaced repetition)" },
];

export const SECONDARY_FILTER_OPTIONS: SelectOption<SecondaryFilterMode>[] = [
  { value: "none", label: "Nothing" },
  { value: "notAnsweredToday", label: "Not answered today" },
  { value: "lastThreeNotCorrect", label: "Last 3 answers not all correct" },
];

export const SORT_OPTIONS: SelectOption<SortMode>[] = [
  { value: "sequence", label: "Sequence number" },
  { value: "leastAnswered", label: "Least number of times answered" },
  { value: "spacedRepetition", label: "Spaced repetition (due first)" },
  { value: "random", label: "Random" },
];

export const SECONDARY_SORT_OPTIONS: SelectOption<SecondarySortMode>[] = [
  { value: "random", label: "Random" },
  { value: "sequence", label: "Sequence number" },
];

export const DEFAULT_FILTER: FilterMode = "all";
export const DEFAULT_SECONDARY_FILTER: SecondaryFilterMode = "none";
export const DEFAULT_SORT: SortMode = "leastAnswered";
export const DEFAULT_SECONDARY_SORT: SecondarySortMode = "random";
