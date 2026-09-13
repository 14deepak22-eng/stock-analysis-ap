"use client";

import { useMemo, useState } from "react";

export default function CandlestickChart({ candles, height = 360 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const { bars, minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (!candles || candles.length === 0) return { bars: [], minPrice: 0, maxPrice: 0, maxVolume: 0 };

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume || 0);

    return {
      bars: candles,
      minPrice: Math.min(...lows),
      maxPrice: Math.max(...highs),
      maxVolume: Math.max(...volumes, 1),
    };
  }, [candles]);

  if (bars.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-12">No candle data available for this range.</div>;
  }

  const width = 800;
  const priceHeight = height * 0.75;
  const volumeHeight = height * 0.2;
  const gap = height * 0.05;
  const padding = { left: 55, right: 15, top: 10, bottom: 10 };
  const chartWidth = width - padding.left - padding.right;
  const candleWidth = Math.max(2, (chartWidth / bars.length) * 0.7);
  const step = chartWidth / bars.length;

  const priceRange = maxPrice - minPrice || 1;
  const priceToY = (price) => padding.top + ((maxPrice - price) / priceRange) * (priceHeight - padding.top - 5);
  const volumeToY = (vol) => priceHeight + gap + volumeHeight - (vol / maxVolume) * volumeHeight;

  const hovered = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {/* Price gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const price = maxPrice - priceRange * f;
          const y = priceToY(price);
          return (
            <g key={f}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={2} y={y + 4} fontSize="10" fill="#94a3b8">{price.toFixed(1)}</text>
            </g>
          );
        })}

        {/* Candles */}
        {bars.map((c, i) => {
          const x = padding.left + i * step + step / 2;
          const isUp = c.close >= c.open;
          const color = isUp ? "#16a34a" : "#dc2626";
          const yHigh = priceToY(c.high);
          const yLow = priceToY(c.low);
          const yOpen = priceToY(c.open);
          const yClose = priceToY(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

          return (
            <g
              key={i}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: "pointer" }}
            >
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                opacity={hoverIndex === i ? 1 : 0.9}
              />
              <rect
                x={x - step / 2}
                y={padding.top}
                width={step}
                height={priceHeight - padding.top}
                fill="transparent"
              />
              {/* Volume bar */}
              <rect
                x={x - candleWidth / 2}
                y={volumeToY(c.volume || 0)}
                width={candleWidth}
                height={priceHeight + gap + volumeHeight - volumeToY(c.volume || 0)}
                fill={color}
                opacity="0.35"
              />
            </g>
          );
        })}

        <line x1={padding.left} y1={priceHeight} x2={width - padding.right} y2={priceHeight} stroke="#e2e8f0" strokeWidth="1" />
      </svg>

      {hovered && (
        <div className="absolute top-0 left-0 bg-white border rounded-lg shadow-md p-2 text-xs pointer-events-none">
          <p className="font-semibold">{hovered.date}</p>
          <p>O: <span className="font-medium">{hovered.open?.toFixed(2)}</span> H: <span className="font-medium">{hovered.high?.toFixed(2)}</span></p>
          <p>L: <span className="font-medium">{hovered.low?.toFixed(2)}</span> C: <span className="font-medium">{hovered.close?.toFixed(2)}</span></p>
          <p>Vol: <span className="font-medium">{hovered.volume?.toLocaleString() ?? "-"}</span></p>
        </div>
      )}
    </div>
  );
}
