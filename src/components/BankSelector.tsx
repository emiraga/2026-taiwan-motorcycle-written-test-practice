import { BANKS } from "@/lib/banks";

interface BankSelectorProps {
  bank: string;
  onBankChange: (bank: string) => void;
}

export function BankSelector({ bank, onBankChange }: BankSelectorProps) {
  return (
    <label className="mt-2 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question bank
      </span>
      <select
        className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-auto"
        value={bank}
        onChange={(e) => onBankChange(e.target.value)}
      >
        {BANKS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
    </label>
  );
}
