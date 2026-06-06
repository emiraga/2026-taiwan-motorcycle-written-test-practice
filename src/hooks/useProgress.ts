import { useCallback, useEffect, useState } from "react";

import type { AnswerValue, BankProgress } from "@/types";
import { BANK_NAME, loadProgress, saveProgress } from "@/lib/storage";

export interface UseProgress {
  progress: BankProgress;
  recordAttempt: (
    questionNumber: number,
    answer: AnswerValue,
    correct: boolean,
  ) => void;
  resetQuestion: (questionNumber: number) => void;
  resetAll: () => void;
}

export function useProgress(): UseProgress {
  const [progress, setProgress] = useState<BankProgress>(() => loadProgress());

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
    setProgress({ bank: BANK_NAME, answers: {} });
  }, []);

  return { progress, recordAttempt, resetQuestion, resetAll };
}
