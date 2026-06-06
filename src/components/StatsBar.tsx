export interface QuestionStats {
  total: number;
  answered: number;
  correctNow: number;
  missed: number;
}

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

export function StatsBar({ stats }: { stats: QuestionStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Total" value={stats.total} />
      <Stat label="Answered" value={stats.answered} />
      <Stat label="Correct now" value={stats.correctNow} />
      <Stat label="Missed ever" value={stats.missed} />
    </div>
  );
}
