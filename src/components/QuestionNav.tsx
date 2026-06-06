interface QuestionNavProps {
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

const navButtonClass =
  "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

export function QuestionNav({
  position,
  total,
  onPrev,
  onNext,
}: QuestionNavProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={position === 0}
        className={navButtonClass}
      >
        ← Previous
      </button>
      <span className="text-sm font-medium text-gray-500">
        Question{" "}
        <span className="font-semibold text-gray-800">{position + 1}</span> of{" "}
        {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={position >= total - 1}
        className={navButtonClass}
      >
        Next →
      </button>
    </div>
  );
}
