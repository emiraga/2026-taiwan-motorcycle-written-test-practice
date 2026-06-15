import { useRef } from "react";

import type {
  FilterMode,
  SecondaryFilterMode,
  SecondarySortMode,
  SortMode,
} from "@/types";
import {
  FILTER_OPTIONS,
  SECONDARY_FILTER_OPTIONS,
  SECONDARY_SORT_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/viewSettings";

interface ControlsProps {
  filter: FilterMode;
  secondaryFilter: SecondaryFilterMode;
  sort: SortMode;
  secondarySort: SecondarySortMode;
  onFilterChange: (filter: FilterMode) => void;
  onSecondaryFilterChange: (filter: SecondaryFilterMode) => void;
  onSortChange: (sort: SortMode) => void;
  onSecondarySortChange: (sort: SecondarySortMode) => void;
  shown: number;
  total: number;
  onResetAll: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSync: () => void;
  onSyncAll: () => void;
}

const selectClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

const buttonClass =
  "rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors";

export function Controls({
  filter,
  secondaryFilter,
  sort,
  secondarySort,
  onFilterChange,
  onSecondaryFilterChange,
  onSortChange,
  onSecondarySortChange,
  shown,
  total,
  onResetAll,
  onExport,
  onImport,
  onSync,
  onSyncAll,
}: ControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          And
        </span>
        <select
          className={selectClass}
          value={secondaryFilter}
          onChange={(e) =>
            onSecondaryFilterChange(e.target.value as SecondaryFilterMode)
          }
        >
          {SECONDARY_FILTER_OPTIONS.map((o) => (
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

      <div className="w-full basis-full" />

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

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Then by
        </span>
        <select
          className={selectClass}
          value={secondarySort}
          onChange={(e) =>
            onSecondarySortChange(e.target.value as SecondarySortMode)
          }
        >
          {SECONDARY_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="w-full basis-full" />

      <button
        type="button"
        onClick={onExport}
        className={`${buttonClass} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
      >
        Export
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          // Reset so selecting the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={`${buttonClass} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
      >
        Import
      </button>

      <button
        type="button"
        onClick={onSync}
        className={`${buttonClass} border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100`}
      >
        Sync
      </button>

      <button
        type="button"
        onClick={onSyncAll}
        className={`${buttonClass} border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100`}
      >
        Sync All
      </button>

      <button
        type="button"
        onClick={onResetAll}
        className={`${buttonClass} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
      >
        Reset all progress
      </button>
    </div>
  );
}
