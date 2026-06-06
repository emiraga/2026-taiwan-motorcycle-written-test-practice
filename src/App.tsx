import { useEffect, useMemo, useState } from "react";

import type { FilterMode, Question, QuestionBank, SortMode } from "@/types";
import { DEFAULT_BANK } from "@/lib/banks";
import {
  isLastIncorrect,
  isUnanswered,
  lastAttempt,
  timesAnswered,
  wasEverIncorrect,
} from "@/lib/progress";
import { useProgress } from "@/hooks/useProgress";
import { exportFileName, mergeProgress, parseProgress } from "@/lib/storage";
import { Controls } from "@/components/Controls";
import { QuestionCard } from "@/components/QuestionCard";
import { BankSelector } from "@/components/BankSelector";
import { StatsBar } from "@/components/StatsBar";
import { QuestionNav } from "@/components/QuestionNav";

function App() {
  const [bank, setBank] = useState<string>(DEFAULT_BANK);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("sequence");
  const [index, setIndex] = useState(0);

  const { progress, recordAttempt, resetQuestion, resetAll, replaceProgress } =
    useProgress(bank);

  const handleExport = () => {
    const json = JSON.stringify(progress, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(bank);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const incoming = parseProgress(await file.text());
      const merged = mergeProgress(progress, incoming);
      replaceProgress(merged);
      window.alert("Import complete.");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Reset the view to a loading state immediately when the bank changes
  // (adjust state during render, as recommended over an effect).
  const [lastBank, setLastBank] = useState(bank);
  if (bank !== lastBank) {
    setLastBank(bank);
    setQuestions(null);
    setError(null);
    setIndex(0);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/${bank}.json`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load question bank: HTTP ${res.status}`);
        }
        return res.json() as Promise<QuestionBank>;
      })
      .then((loaded) => {
        if (!cancelled) setQuestions(loaded.questions);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [bank]);

  // Build the filtered + sorted question list from the current progress. This
  // is snapshotted into state (below) rather than derived live, so answering a
  // question doesn't immediately drop it out of a filtered view. The 2-second
  // auto-advance after a correct answer in the "Unanswered" filter relies on
  // the question staying mounted until the timer fires.
  const buildList = (): Question[] => {
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
    if (sort === "random") {
      // Fisher-Yates shuffle. Reshuffles whenever the view is re-snapshotted
      // (i.e. when the sort is (re)selected), not on every progress update.
      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    return list;
  };

  // Re-snapshot the list (and jump back to the first question) only when the
  // view inputs change — the filter, the sort, or the loaded question set — not
  // on every progress update. Adjust state during render, as recommended over
  // an effect.
  const [filtered, setFiltered] = useState<Question[]>(buildList);
  const view = `${filter}|${sort}`;
  const [lastView, setLastView] = useState(view);
  const [lastQuestions, setLastQuestions] = useState(questions);
  if (view !== lastView || questions !== lastQuestions) {
    setLastView(view);
    setLastQuestions(questions);
    setFiltered(buildList());
    setIndex(0);
  }

  // Keep the current index within bounds as the filtered list shrinks/grows.
  const safeIndex =
    filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1);

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
  const goNext = () => setIndex(Math.min(safeIndex + 1, filtered.length - 1));
  const goPrev = () => setIndex(Math.max(safeIndex - 1, 0));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <BankSelector bank={bank} onBankChange={setBank} />
        </header>

        <div className="mb-6">
          <StatsBar stats={stats} />
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
            onExport={handleExport}
            onImport={handleImport}
          />
        </div>

        {filtered.length === 0 || !current ? (
          <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            No questions match this filter. 🎉
          </p>
        ) : (
          <>
            <div className="mb-3">
              <QuestionNav
                position={safeIndex}
                total={filtered.length}
                onPrev={goPrev}
                onNext={goNext}
              />
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
