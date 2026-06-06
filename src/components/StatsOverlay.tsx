import { useMemo } from "react";
import { X } from "lucide-react";

import type { BankProgress, Question, QuestionProgress } from "@/types";
import { attemptsOf, lastAttempt, timesAnswered } from "@/lib/progress";

interface StatsOverlayProps {
  questions: Question[];
  progress: BankProgress;
  onClose: () => void;
}

interface Bar {
  key: string | number;
  label: string;
  count: number;
  percent: number;
}

type Outcome =
  | "unanswered"
  | "alwaysCorrect"
  | "sometimeWrong"
  | "lastWrong"
  | "alwaysWrong";

/** Ordered category definitions for the outcome chart. */
const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: "unanswered", label: "Unanswered" },
  { key: "alwaysCorrect", label: "Always correct" },
  { key: "sometimeWrong", label: "Sometime wrong" },
  { key: "lastWrong", label: "Last time wrong" },
  { key: "alwaysWrong", label: "Always wrong" },
];

/** Classify a question into exactly one mutually-exclusive outcome bucket. */
function classify(progress?: QuestionProgress): Outcome {
  const attempts = attemptsOf(progress);
  if (attempts.length === 0) return "unanswered";
  const everWrong = attempts.some((a) => !a.correct);
  if (!everWrong) return "alwaysCorrect";
  if (attempts.every((a) => !a.correct)) return "alwaysWrong";
  return lastAttempt(progress)?.correct ? "sometimeWrong" : "lastWrong";
}

/** Group questions by how many times they've been answered (0..max). */
function timesAnsweredBars(
  questions: Question[],
  progress: BankProgress,
): Bar[] {
  const counts: number[] = [];
  let max = 0;
  for (const q of questions) {
    const n = timesAnswered(progress.answers[q.number]);
    counts[n] = (counts[n] ?? 0) + 1;
    if (n > max) max = n;
  }

  const total = questions.length;
  const bars: Bar[] = [];
  for (let times = 0; times <= max; times++) {
    const count = counts[times] ?? 0;
    bars.push({
      key: times,
      label: String(times),
      count,
      percent: total === 0 ? 0 : (count / total) * 100,
    });
  }
  return bars;
}

/** Group questions by outcome category. */
function outcomeBars(questions: Question[], progress: BankProgress): Bar[] {
  const counts = new Map<Outcome, number>();
  for (const q of questions) {
    const o = classify(progress.answers[q.number]);
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }

  const total = questions.length;
  return OUTCOMES.map(({ key, label }) => {
    const count = counts.get(key) ?? 0;
    return {
      key,
      label,
      count,
      percent: total === 0 ? 0 : (count / total) * 100,
    };
  });
}

function BarChart({
  bars,
  caption,
  barClass,
}: {
  bars: Bar[];
  caption: string;
  barClass: string;
}) {
  const maxCount = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div>
      <div className="flex items-stretch gap-3" style={{ height: "16rem" }}>
        {bars.map((b) => (
          <div
            key={b.key}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <div className="text-xs font-semibold text-gray-700">
              {b.count}
              <span className="ml-1 font-normal text-gray-400">
                ({b.percent.toFixed(0)}%)
              </span>
            </div>
            <div
              className={`w-full rounded-t ${barClass}`}
              style={{ height: `${(b.count / maxCount) * 100}%` }}
            />
            <div className="text-center text-xs font-medium text-gray-500">
              {b.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
        {caption}
      </p>
    </div>
  );
}

export function StatsOverlay({
  questions,
  progress,
  onClose,
}: StatsOverlayProps) {
  // Computed only while the overlay is mounted, i.e. when stats are shown.
  const { timesBars, categoryBars } = useMemo(
    () => ({
      timesBars: timesAnsweredBars(questions, progress),
      categoryBars: outcomeBars(questions, progress),
    }),
    [questions, progress],
  );

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
          <h2 className="text-lg font-bold text-gray-900">Stats</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close stats"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <BarChart
          bars={timesBars}
          caption="Times answered"
          barClass="bg-blue-500"
        />

        <div className="mt-8">
          <BarChart
            bars={categoryBars}
            caption="Outcome"
            barClass="bg-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
