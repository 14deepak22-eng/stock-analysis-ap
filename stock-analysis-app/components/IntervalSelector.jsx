"use client";

const INTERVALS = ["1min", "5min", "15min", "1hr", "1day"];

export default function IntervalSelector({ selected, onChange, disabled }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {INTERVALS.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selected === key
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
