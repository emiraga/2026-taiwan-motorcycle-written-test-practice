import { useCallback, useEffect, useState } from "react";

import type { AnswerValue, BankProgress } from "@/types";
import { loadProgress, saveProgress } from "@/lib/storage";

export interface UseProgress {
  progress: BankProgress;
  recordAttempt: (
    questionNumber: number,
    answer: AnswerValue,
    correct: boolean,
  ) => void;
  resetQuestion: (questionNumber: number) => void;
  resetAll: () => void;
  replaceProgress: (next: BankProgress) => void;
}

export function useProgress(bank: string): UseProgress {
  const [progress, setProgress] = useState<BankProgress>(() =>
    loadProgress(bank),
  );

  // Reload progress whenever the selected bank changes (adjust state during
  // render, as recommended over an effect).
  const [lastBank, setLastBank] = useState(bank);
  if (bank !== lastBank) {
    setLastBank(bank);
    setProgress(loadProgress(bank));
  }

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const recordAttempt = useCallback(
    (questionNumber: number, answer: AnswerValue, correct: boolean) => {
      setProgress((prev) => {
        const existing = prev.answers[questionNumber]?.attempts ?? [];
        return {
          ...prev,
          answers: {
            ...prev.answers,
            [questionNumber]: {
              attempts: [
                ...existing,
                { answer, correct, timestamp: Date.now() },
              ],
            },
          },
        };
      });
    },
    [],
  );

  const resetQuestion = useCallback((questionNumber: number) => {
    setProgress((prev) => {
      const next = { ...prev.answers };
      delete next[questionNumber];
      return { ...prev, answers: next };
    });
  }, []);

  const resetAll = useCallback(() => {
    setProgress((prev) => ({ bank: prev.bank, answers: {} }));
  }, []);

  const replaceProgress = useCallback((next: BankProgress) => {
    setProgress(next);
  }, []);

  return {
    progress,
    recordAttempt,
    resetQuestion,
    resetAll,
    replaceProgress,
  };
}
