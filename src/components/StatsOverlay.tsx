import { useMemo } from "react";
import { X } from "lucide-react";

import type { BankProgress, Question } from "@/types";
import { timesAnswered } from "@/lib/progress";

interface StatsOverlayProps {
  questions: Question[];
  progress: BankProgress;
  onClose: () => void;
}

interface Bucket {
  times: number;
  count: number;
  percent: number;
}

/**
 * Group questions by how many times they've been answered, returning one
 * bucket per answer-count from 0 up to the maximum observed.
 */
function buildBuckets(questions: Question[], progress: BankProgress): Bucket[] {
  const counts: number[] = [];
  let max = 0;
  for (const q of questions) {
    const n = timesAnswered(progress.answers[q.number]);
    counts[n] = (counts[n] ?? 0) + 1;
    if (n > max) max = n;
  }

  const total = questions.length;
  const buckets: Bucket[] = [];
  for (let times = 0; times <= max; times++) {
    const count = counts[times] ?? 0;
    buckets.push({
      times,
      count,
      percent: total === 0 ? 0 : (count / total) * 100,
    });
  }
  return buckets;
}

export function StatsOverlay({
  questions,
  progress,
  onClose,
}: StatsOverlayProps) {
  // Computed only while the overlay is mounted, i.e. when stats are shown.
  const buckets = useMemo(
    () => buildBuckets(questions, progress),
    [questions, progress],
  );
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Questions by times answered
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close stats"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-stretch gap-3" style={{ height: "16rem" }}>
          {buckets.map((b) => (
            <div
              key={b.times}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div className="text-xs font-semibold text-gray-700">
                {b.count}
                <span className="ml-1 font-normal text-gray-400">
                  ({b.percent.toFixed(0)}%)
                </span>
              </div>
              <div
                className="w-full rounded-t bg-blue-500"
                style={{ height: `${(b.count / maxCount) * 100}%` }}
              />
              <div className="text-xs font-medium text-gray-500">{b.times}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
          Times answered
        </p>
      </div>
    </div>
  );
}
