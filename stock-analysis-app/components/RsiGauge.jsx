"use client";

export default function RsiGauge({ rsi }) {
  if (rsi == null) return null;
  const clamped = Math.max(0, Math.min(100, rsi));
  const angle = (clamped / 100) * 180 - 90;

  const zoneLabel = rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral";
  const zoneColor = rsi > 70 ? "#dc2626" : rsi < 30 ? "#16a34a" : "#6366f1";

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="100" viewBox="0 0 180 100">
        <path d="M10,90 A80,80 0 0,1 60,14" stroke="#16a34a" strokeWidth="14" fill="none" />
        <path d="M60,14 A80,80 0 0,1 120,14" stroke="#6366f1" strokeWidth="14" fill="none" />
        <path d="M120,14 A80,80 0 0,1 170,90" stroke="#dc2626" strokeWidth="14" fill="none" />
        <line
          x1="90" y1="90"
          x2={90 + 65 * Math.cos((angle * Math.PI) / 180)}
          y2={90 + 65 * Math.sin((angle * Math.PI) / 180)}
          stroke="#1f2937" strokeWidth="3" strokeLinecap="round"
        />
        <circle cx="90" cy="90" r="5" fill="#1f2937" />
      </svg>
      <p className="text-2xl font-bold -mt-2" style={{ color: zoneColor }}>{rsi.toFixed(1)}</p>
      <p className="text-xs text-gray-400">{zoneLabel} (RSI)</p>
    </div>
  );
}
