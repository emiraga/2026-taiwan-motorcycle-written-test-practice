import { useEffect, useRef, useState, type ReactNode } from "react";

import type { AnswerValue, Question, QuestionProgress } from "@/types";
import { cn } from "@/lib/utils";
import {
  isLastIncorrect,
  isUnanswered,
  lastAttempt,
  timesAnswered,
  wasEverIncorrect,
} from "@/lib/progress";

interface QuestionCardProps {
  question: Question;
  progress?: QuestionProgress;
  onAnswer: (answer: AnswerValue, correct: boolean) => void;
  onReset: () => void;
  /** Advance to the next question. Omit on the last question. */
  onNext?: () => void;
}

function StatusBadge({ progress }: { progress?: QuestionProgress }) {
  if (isUnanswered(progress)) {
    return <Badge className="bg-gray-100 text-gray-600">Unanswered</Badge>;
  }
  if (isLastIncorrect(progress)) {
    return <Badge className="bg-red-100 text-red-700">Last: incorrect</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700">Last: correct</Badge>;
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function QuestionCard({
  question,
  progress,
  onAnswer,
  onReset,
  onNext,
}: QuestionCardProps) {
  const last = lastAttempt(progress);
  // Start revealed if this question has already been answered, showing the
  // most recent attempt. "Answer again" un-reveals it for a fresh attempt.
  const [revealed, setRevealed] = useState(last !== undefined);
  const [selected, setSelected] = useState<AnswerValue | null>(
    last?.answer ?? null,
  );
  // Set when the user answers correctly this session, triggering the 2-second
  // auto-advance. Not set when revisiting an already-answered question, so we
  // never auto-skip questions the user navigates to.
  const [autoAdvance, setAutoAdvance] = useState(false);

  // Keep the latest onNext in a ref so the timer effect depends only on
  // autoAdvance and never restarts the countdown on unrelated re-renders.
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  });

  useEffect(() => {
    if (!autoAdvance) return;
    const id = setTimeout(() => onNextRef.current?.(), 2000);
    return () => clearTimeout(id);
  }, [autoAdvance]);

  const answer = (value: AnswerValue) => {
    const correct = value !== "idk" && value === question.correct;
    onAnswer(value, correct);
    setSelected(value);
    setRevealed(true);
    if (correct) setAutoAdvance(true);
  };

  const answerAgain = () => {
    setRevealed(false);
    setSelected(null);
    setAutoAdvance(false);
  };

  const reset = () => {
    onReset();
    setRevealed(false);
    setSelected(null);
    setAutoAdvance(false);
  };

  const selectedCorrect =
    selected !== null && selected !== "idk" && selected === question.correct;

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-400">
          #{question.number}
        </span>
        <div className="flex items-center gap-2">
          {timesAnswered(progress) > 0 && (
            <Badge className="bg-gray-100 text-gray-500">
              answered {timesAnswered(progress)}×
            </Badge>
          )}
          {wasEverIncorrect(progress) && (
            <Badge className="bg-amber-100 text-amber-700">missed before</Badge>
          )}
          <StatusBadge progress={progress} />
        </div>
      </div>

      {question.pictures?.map((pic) => (
        <img
          key={pic}
          src={`/${pic}`}
          alt={`Illustration for question ${question.number}`}
          loading="lazy"
          className="mb-3 max-h-64 rounded-lg border border-gray-100 object-contain"
        />
      ))}

      <p className="mb-4 text-base font-medium text-gray-900">
        {question.question || (
          <span className="text-gray-500 italic">
            Answer based on the image above.
          </span>
        )}
      </p>

      <div className="space-y-2">
        {question.options.map((option, idx) => {
          const optionNumber = idx + 1; // options are 1-based
          const isCorrectOption = optionNumber === question.correct;
          const isSelectedOption = selected === optionNumber;

          let stateClass =
            "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50";
          if (revealed) {
            if (isCorrectOption) {
              stateClass = "border-green-400 bg-green-50 text-green-800";
            } else if (isSelectedOption) {
              stateClass = "border-red-400 bg-red-50 text-red-800";
            } else {
              stateClass = "border-gray-200 bg-white text-gray-500";
            }
          }

          return (
            <button
              key={optionNumber}
              type="button"
              disabled={revealed}
              onClick={() => answer(optionNumber)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-default",
                stateClass,
              )}
            >
              <span className="font-semibold text-gray-400">
                {optionNumber}.
              </span>
              <span>{option}</span>
              {revealed && isCorrectOption && (
                <span className="ml-auto text-xs font-semibold text-green-600">
                  correct answer
                </span>
              )}
              {revealed && isSelectedOption && !isCorrectOption && (
                <span className="ml-auto text-xs font-semibold text-red-600">
                  your answer
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {!revealed ? (
          <button
            type="button"
            onClick={() => answer("idk")}
            className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            I don't know
          </button>
        ) : (
          <>
            <span
              className={cn(
                "text-sm font-semibold",
                selected === "idk"
                  ? "text-amber-600"
                  : selectedCorrect
                    ? "text-green-600"
                    : "text-red-600",
              )}
            >
              {selected === "idk"
                ? "Marked “I don't know” (counted as incorrect)"
                : selectedCorrect
                  ? autoAdvance
                    ? "Correct! Next question in 2s…"
                    : "Correct!"
                  : "Incorrect"}
            </span>
            <button
              type="button"
              onClick={answerAgain}
              className="ml-auto text-sm font-medium text-blue-600 hover:underline"
            >
              Answer again
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-gray-400 hover:text-gray-600 hover:underline"
            >
              Clear history
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                autoFocus
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Next →
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
