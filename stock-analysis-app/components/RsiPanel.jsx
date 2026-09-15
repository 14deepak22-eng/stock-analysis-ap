"use client";

export default function RsiPanel({ candles, period = 14, height = 140 }) {
  if (!candles || candles.length < period + 1) {
    return <p className="text-xs text-gray-400 text-center py-6">Not enough data for RSI.</p>;
  }

  const closes = candles.map((c) => c.close);
  const rsiSeries = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsiSeries.push(null);
      continue;
    }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    rsiSeries.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  const width = 900;
  const padding = { left: 55, right: 15, top: 10, bottom: 10 };
  const chartWidth = width - padding.left - padding.right;
  const step = chartWidth / candles.length;
  const plotHeight = height - padding.top - padding.bottom;

  const yFor = (rsi) => padding.top + (1 - rsi / 100) * plotHeight;

  const points = rsiSeries
    .map((rsi, i) => (rsi == null ? null : `${padding.left + i * step},${yFor(rsi)}`))
    .filter(Boolean)
    .join(" ");

  const currentRsi = [...rsiSeries].reverse().find((r) => r != null);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-600">RSI (14)</h3>
        {currentRsi != null && (
          <span className={`text-xs font-bold ${currentRsi > 70 ? "text-red-600" : currentRsi < 30 ? "text-green-600" : "text-gray-500"}`}>
            {currentRsi.toFixed(1)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {/* Overbought/oversold stripe band */}
        <rect x={padding.left} y={yFor(70)} width={chartWidth} height={yFor(30) - yFor(70)} fill="#eef2ff" />
        <line x1={padding.left} y1={yFor(70)} x2={width - padding.right} y2={yFor(70)} stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" />
        <line x1={padding.left} y1={yFor(30)} x2={width - padding.right} y2={yFor(30)} stroke="#16a34a" strokeWidth="1" strokeDasharray="4 3" />
        <line x1={padding.left} y1={yFor(50)} x2={width - padding.right} y2={yFor(50)} stroke="#e2e8f0" strokeWidth="1" />

        <text x={2} y={yFor(70) + 3} fontSize="9" fill="#dc2626">70</text>
        <text x={2} y={yFor(30) + 3} fontSize="9" fill="#16a34a">30</text>

        <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
