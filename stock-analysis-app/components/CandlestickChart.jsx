"use client";

import { useMemo, useState, useRef, useCallback } from "react";

export default function CandlestickChart({ candles, support = [], resistance = [], height = 420 }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [mouseY, setMouseY] = useState(null);
  const [zoomRange, setZoomRange] = useState(null); // [startIdx, endIdx] or null = full
  const [dragStart, setDragStart] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [lines, setLines] = useState([]); // [{x1,y1,x2,y2}]
  const [pendingLine, setPendingLine] = useState(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  const visibleCandles = useMemo(() => {
    if (!candles) return [];
    if (!zoomRange) return candles;
    return candles.slice(zoomRange[0], zoomRange[1] + 1);
  }, [candles, zoomRange]);

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (visibleCandles.length === 0) return { minPrice: 0, maxPrice: 0, maxVolume: 0 };
    const highs = visibleCandles.map((c) => c.high);
    const lows = visibleCandles.map((c) => c.low);
    const volumes = visibleCandles.map((c) => c.volume || 0);
    return {
      minPrice: Math.min(...lows),
      maxPrice: Math.max(...highs),
      maxVolume: Math.max(...volumes, 1),
    };
  }, [visibleCandles]);

  const width = 900;
  const priceHeight = height * 0.72;
  const volumeHeight = height * 0.18;
  const gap = height * 0.04;
  const padding = { left: 55, right: 15, top: 10, bottom: 10 };
  const chartWidth = width - padding.left - padding.right;
  const step = visibleCandles.length ? chartWidth / visibleCandles.length : 0;
  const candleWidth = Math.max(2, step * 0.7);
  const priceRange = maxPrice - minPrice || 1;

  const priceToY = useCallback(
    (price) => padding.top + ((maxPrice - price) / priceRange) * (priceHeight - padding.top - 5),
    [maxPrice, priceRange, priceHeight]
  );
  const yToPrice = useCallback(
    (y) => maxPrice - ((y - padding.top) / (priceHeight - padding.top - 5)) * priceRange,
    [maxPrice, priceRange, priceHeight]
  );
  const volumeToY = (vol) => priceHeight + gap + volumeHeight - (vol / maxVolume) * volumeHeight;

  function getSvgCoords(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleMouseMove(e) {
    const { x, y } = getSvgCoords(e);
    const idx = Math.floor((x - padding.left) / step);
    if (idx >= 0 && idx < visibleCandles.length) setHoverIndex(idx);
    setMouseY(y);

    if (dragStart) {
      setDragStart((prev) => ({ ...prev, currentX: x }));
    }
    if (drawMode && pendingLine) {
      setPendingLine((prev) => ({ ...prev, x2: x, y2: y }));
    }
  }

  function handleMouseDown(e) {
    if (drawMode) {
      const { x, y } = getSvgCoords(e);
      if (!pendingLine) {
        setPendingLine({ x1: x, y1: y, x2: x, y2: y });
      } else {
        setLines((prev) => [...prev, pendingLine]);
        setPendingLine(null);
      }
      return;
    }
    const { x } = getSvgCoords(e);
    setDragStart({ startX: x, currentX: x });
  }

  function handleMouseUp() {
    if (dragStart) {
      const { startX, currentX } = dragStart;
      if (Math.abs(currentX - startX) > 15) {
        const startIdx = Math.max(0, Math.floor((Math.min(startX, currentX) - padding.left) / step));
        const endIdx = Math.min(
          visibleCandles.length - 1,
          Math.ceil((Math.max(startX, currentX) - padding.left) / step)
        );
        const baseOffset = zoomRange ? zoomRange[0] : 0;
        if (endIdx > startIdx) {
          setZoomRange([baseOffset + startIdx, baseOffset + endIdx]);
        }
      }
      setDragStart(null);
    }
  }

  function resetZoom() {
    setZoomRange(null);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function clearDrawings() {
    setLines([]);
    setPendingLine(null);
  }

  if (visibleCandles.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-12">No candle data available for this range.</div>;
  }

  const hovered = hoverIndex != null ? visibleCandles[hoverIndex] : null;
  const hoverPrice = mouseY != null ? yToPrice(mouseY) : null;

  return (
    <div ref={containerRef} className="bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawMode((d) => !d)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition ${
              drawMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            ✏️ Draw line
          </button>
          {lines.length > 0 && (
            <button onClick={clearDrawings} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-500 transition">
              Clear drawings
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {zoomRange && (
            <button onClick={resetZoom} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
              🔍 Reset zoom
            </button>
          )}
          <button onClick={toggleFullscreen} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
            ⛶ Fullscreen
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-2">Drag on the chart to zoom into a range. Toggle "Draw line" then click two points to sketch a trendline.</p>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full select-none"
          style={{ height, cursor: drawMode ? "crosshair" : "col-resize" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoverIndex(null); setMouseY(null); setDragStart(null); }}
        >
          {/* Price gridlines + labels */}
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

          {/* Support / resistance lines */}
          {support?.slice(0, 2).map((s, i) => (
            <g key={"sup" + i}>
              <line x1={padding.left} y1={priceToY(s.level)} x2={width - padding.right} y2={priceToY(s.level)} stroke="#16a34a" strokeWidth="1.5" strokeDasharray="5 3" />
              <text x={width - padding.right - 4} y={priceToY(s.level) - 3} fontSize="9" fill="#16a34a" textAnchor="end">Support {s.level}</text>
            </g>
          ))}
          {resistance?.slice(0, 2).map((r, i) => (
            <g key={"res" + i}>
              <line x1={padding.left} y1={priceToY(r.level)} x2={width - padding.right} y2={priceToY(r.level)} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5 3" />
              <text x={width - padding.right - 4} y={priceToY(r.level) - 3} fontSize="9" fill="#dc2626" textAnchor="end">Resistance {r.level}</text>
            </g>
          ))}

          {/* Candles + volume */}
          {visibleCandles.map((c, i) => {
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
              <g key={i}>
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
                <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} opacity={hoverIndex === i ? 1 : 0.9} />
                <rect x={x - candleWidth / 2} y={volumeToY(c.volume || 0)} width={candleWidth} height={priceHeight + gap + volumeHeight - volumeToY(c.volume || 0)} fill={color} opacity="0.3" />
              </g>
            );
          })}

          {/* User-drawn trendlines */}
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f59e0b" strokeWidth="2" />
          ))}
          {pendingLine && (
            <line x1={pendingLine.x1} y1={pendingLine.y1} x2={pendingLine.x2} y2={pendingLine.y2} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
          )}

          {/* Drag-to-zoom selection box */}
          {dragStart && (
            <rect
              x={Math.min(dragStart.startX, dragStart.currentX)}
              y={padding.top}
              width={Math.abs(dragStart.currentX - dragStart.startX)}
              height={priceHeight - padding.top}
              fill="#4f46e5"
              opacity="0.1"
            />
          )}

          {/* Crosshair */}
          {hovered && hoverIndex != null && !dragStart && (
            <>
              <line x1={padding.left + hoverIndex * step + step / 2} y1={padding.top} x2={padding.left + hoverIndex * step + step / 2} y2={priceHeight} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
              {mouseY != null && (
                <>
                  <line x1={padding.left} y1={mouseY} x2={width - padding.right} y2={mouseY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
                  <rect x={2} y={mouseY - 8} width="48" height="16" fill="#1f2937" rx="3" />
                  <text x={6} y={mouseY + 4} fontSize="10" fill="white">{hoverPrice?.toFixed(1)}</text>
                </>
              )}
            </>
          )}

          <line x1={padding.left} y1={priceHeight} x2={width - padding.right} y2={priceHeight} stroke="#e2e8f0" strokeWidth="1" />
        </svg>

        {hovered && (
          <div className="absolute top-0 left-14 bg-white border rounded-lg shadow-md p-2 text-xs pointer-events-none">
            <p className="font-semibold">{hovered.date?.slice(0, 16)}</p>
            <p>O: <span className="font-medium">{hovered.open?.toFixed(2)}</span> H: <span className="font-medium">{hovered.high?.toFixed(2)}</span></p>
            <p>L: <span className="font-medium">{hovered.low?.toFixed(2)}</span> C: <span className="font-medium">{hovered.close?.toFixed(2)}</span></p>
            <p>Vol: <span className="font-medium">{hovered.volume?.toLocaleString() ?? "-"}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
