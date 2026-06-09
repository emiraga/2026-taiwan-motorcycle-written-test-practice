import { useEffect, useRef, useState, type ReactNode } from "react";

import type { AnswerValue, Question, QuestionProgress } from "@/types";
import { cn } from "@/lib/utils";
import {
  isLastIncorrect,
  isUnanswered,
  timesAnswered,
  wasEverIncorrect,
} from "@/lib/progress";
import {
  useKeyboardShortcuts,
  type KeyHandlers,
} from "@/hooks/useKeyboardShortcuts";

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

/**
 * Build a prompt asking an AI to explain the question. Pictures are ignored
 * since they can't be passed along to the chat.
 */
function buildExplainPrompt(question: Question): string {
  const intro =
    "I am practicing Taiwanese motorcycle driving exam questions. Explain this one to me:";
  const options = question.options
    .map((option, idx) => `${idx + 1}. ${option}`)
    .join("\n");
  const correctText = question.options[question.correct - 1] ?? "";
  return `${intro}\n\n${question.question}\n\n${options}\n\nCorrect answer: ${question.correct}. ${correctText}`;
}

const explainButtonClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50";

/** Claude natively prefills the prompt via the `?q=` query parameter. */
function ClaudeExplainLink({ prompt }: { prompt: string }) {
  return (
    <a
      href={`https://claude.ai/new?q=${encodeURIComponent(prompt)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={explainButtonClass}
    >
      Claude
    </a>
  );
}

/**
 * Gemini has no URL-prefill mechanism, so we copy the prompt to the clipboard
 * and open Gemini in a new tab for the user to paste.
 */
function GeminiExplainButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    window.open("https://gemini.google.com/app", "_blank", "noopener");
  };

  return (
    <button type="button" onClick={handleClick} className={explainButtonClass}>
      {copied ? "Copied — paste in Gemini" : "Gemini"}
    </button>
  );
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
  // Always start un-revealed, even for previously answered questions, so the
  // user can re-answer for practice without seeing their prior answer. The
  // history badges above still reflect past attempts. Answering reveals the
  // result (and auto-advances on correct) just like the first time.
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<AnswerValue | null>(null);
  // Set when the user answers correctly this session, triggering the 2-second
  // auto-advance. Not set when revisiting an already-answered question, so we
  // never auto-skip questions the user navigates to.
  const [autoAdvance, setAutoAdvance] = useState(false);

  // True once the local <video> fails to load (e.g. the file is missing), so we
  // can fall back to the embedded video_url iframe. Reset during render when the
  // question's video changes (React's "adjust state on prop change" pattern).
  const [videoFileFailed, setVideoFileFailed] = useState(false);
  const [videoFileTried, setVideoFileTried] = useState(question.video_file);
  if (videoFileTried !== question.video_file) {
    setVideoFileTried(question.video_file);
    setVideoFileFailed(false);
  }

  // Keep the latest onNext in a ref so the timer effect depends only on
  // autoAdvance and never restarts the countdown on unrelated re-renders.
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  });

  useEffect(() => {
    if (!autoAdvance) return;
    const id = setTimeout(() => onNextRef.current?.(), 1000);
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

  // Pressing "1"/"2"/"3"… answers with that option, matching the option
  // buttons (which are disabled once the answer is revealed).
  const answerShortcuts: KeyHandlers = {};
  question.options.forEach((_, idx) => {
    const optionNumber = idx + 1;
    answerShortcuts[String(optionNumber)] = () => {
      if (!revealed) answer(optionNumber);
    };
  });
  // "4" is the "I don't know" button (questions have at most 3 options, so it
  // never collides with an option shortcut).
  answerShortcuts["4"] = () => {
    if (!revealed) answer("idk");
  };
  useKeyboardShortcuts(answerShortcuts);

  const selectedCorrect =
    selected !== null && selected !== "idk" && selected === question.correct;

  const explainPrompt = buildExplainPrompt(question);

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

      {question.video_file && !videoFileFailed && (
        <video
          key={question.video_file}
          src={`/${question.video_file}`}
          controls
          autoPlay
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFileFailed(true)}
          className="mb-3 max-h-80 w-full rounded-lg border border-gray-100 bg-black object-contain"
        />
      )}

      {/* Fall back to the embedded URL when there is no local file, or the
          local file failed to load (e.g. it's missing). */}
      {(!question.video_file || videoFileFailed) && question.video_url && (
        <iframe
          key={question.video_url}
          src={question.video_url}
          title={`Video for question ${question.number}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="mb-3 aspect-video w-full rounded-lg border border-gray-100 bg-black"
        />
      )}

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

      {revealed && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            Explain with AI:
          </span>
          <ClaudeExplainLink prompt={explainPrompt} />
          <GeminiExplainButton prompt={explainPrompt} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {!revealed ? (
          <button
            type="button"
            onClick={() => answer("idk")}
            className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            4. &nbsp;I don't know
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
                    ? "Correct! Next question in 1s…"
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
                // Focus without scrolling: the default autoFocus (or focus())
                // scrolls this button into view, which causes a jarring jump
                // when answering via the 1/2/3 keyboard shortcuts.
                ref={(el) => el?.focus({ preventScroll: true })}
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
