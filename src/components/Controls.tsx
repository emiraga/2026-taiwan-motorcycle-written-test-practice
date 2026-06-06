import type { FilterMode, SortMode } from "@/types";

interface ControlsProps {
  filter: FilterMode;
  sort: SortMode;
  onFilterChange: (filter: FilterMode) => void;
  onSortChange: (sort: SortMode) => void;
  shown: number;
  total: number;
  onResetAll: () => void;
}

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All questions" },
  { value: "unanswered", label: "Unanswered questions" },
  { value: "lastIncorrect", label: "Last answer incorrect" },
  { value: "incorrectEver", label: "Answered incorrect at any time" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "sequence", label: "Sequence number" },
  { value: "leastAnswered", label: "Least number of times answered" },
  { value: "random", label: "Random" },
];

const selectClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

export function Controls({
  filter,
  sort,
  onFilterChange,
  onSortChange,
  shown,
  total,
  onResetAll,
}: ControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Filter
        </span>
        <select
          className={selectClass}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as FilterMode)}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Sort by
        </span>
        <select
          className={selectClass}
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <span className="ml-auto text-sm text-gray-500">
        Showing <span className="font-semibold text-gray-800">{shown}</span> of{" "}
        {total}
      </span>

      <button
        type="button"
        onClick={onResetAll}
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        Reset all progress
      </button>
    </div>
  );
}
