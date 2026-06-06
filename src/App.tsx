import { useEffect, useMemo, useState } from "react";

import type { FilterMode, Question, QuestionBank, SortMode } from "@/types";
import { BANK_NAME } from "@/lib/storage";
import {
  isLastIncorrect,
  isUnanswered,
  lastAttempt,
  timesAnswered,
  wasEverIncorrect,
} from "@/lib/progress";
import { useProgress } from "@/hooks/useProgress";
import { Controls } from "@/components/Controls";
import { QuestionCard } from "@/components/QuestionCard";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
    </div>
  );
}

function App() {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("sequence");
  const [index, setIndex] = useState(0);

  const { progress, recordAttempt, resetQuestion, resetAll } = useProgress();

  useEffect(() => {
    let cancelled = false;
    fetch(`/${BANK_NAME}.json`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load question bank: HTTP ${res.status}`);
        }
        return res.json() as Promise<QuestionBank>;
      })
      .then((bank) => {
        if (!cancelled) setQuestions(bank.questions);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!questions) return [];
    const list = questions.filter((q) => {
      const p = progress.answers[q.number];
      switch (filter) {
        case "unanswered":
          return isUnanswered(p);
        case "lastIncorrect":
          return isLastIncorrect(p);
        case "incorrectEver":
          return wasEverIncorrect(p);
        default:
          return true;
      }
    });

    if (sort === "leastAnswered") {
      return [...list].sort((a, b) => {
        const diff =
          timesAnswered(progress.answers[a.number]) -
          timesAnswered(progress.answers[b.number]);
        return diff !== 0 ? diff : a.number - b.number;
      });
    }
    return list;
  }, [questions, progress, filter, sort]);

  // Jump back to the first question whenever the filter/sort view changes
  // (adjust state during render, as recommended over an effect).
  const view = `${filter}|${sort}`;
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    setIndex(0);
  }

  // Keep the current index within bounds as the filtered list shrinks/grows.
  const safeIndex = filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1);

  const stats = useMemo(() => {
    if (!questions) return { total: 0, answered: 0, correctNow: 0, missed: 0 };
    let answered = 0;
    let correctNow = 0;
    let missed = 0;
    for (const q of questions) {
      const p = progress.answers[q.number];
      if (isUnanswered(p)) continue;
      answered += 1;
      if (lastAttempt(p)?.correct) correctNow += 1;
      if (wasEverIncorrect(p)) missed += 1;
    }
    return { total: questions.length, answered, correctNow, missed };
  }, [questions, progress]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <h1 className="mb-2 text-lg font-bold">Could not load questions</h1>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-gray-500">
        Loading questions…
      </div>
    );
  }

  const current = filtered[safeIndex];
  const isLast = safeIndex >= filtered.length - 1;
  const goNext = () =>
    setIndex(Math.min(safeIndex + 1, filtered.length - 1));
  const goPrev = () => setIndex(Math.max(safeIndex - 1, 0));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Motorcycle Written Test
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Question bank:{" "}
            <span className="font-medium text-gray-700">{BANK_NAME}</span>
          </p>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={stats.total} />
          <Stat label="Answered" value={stats.answered} />
          <Stat label="Correct now" value={stats.correctNow} />
          <Stat label="Missed ever" value={stats.missed} />
        </div>

        <div className="mb-6">
          <Controls
            filter={filter}
            sort={sort}
            onFilterChange={setFilter}
            onSortChange={setSort}
            shown={filtered.length}
            total={questions.length}
            onResetAll={() => {
              if (
                window.confirm(
                  "Reset all saved answers? This cannot be undone.",
                )
              ) {
                resetAll();
              }
            }}
          />
        </div>

        {filtered.length === 0 || !current ? (
          <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            No questions match this filter. 🎉
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={safeIndex === 0}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-sm font-medium text-gray-500">
                Question{" "}
                <span className="font-semibold text-gray-800">
                  {safeIndex + 1}
                </span>{" "}
                of {filtered.length}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={isLast}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>

            <ul>
              <QuestionCard
                key={current.number}
                question={current}
                progress={progress.answers[current.number]}
                onAnswer={(answer, correct) =>
                  recordAttempt(current.number, answer, correct)
                }
                onReset={() => resetQuestion(current.number)}
                onNext={isLast ? undefined : goNext}
              />
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
