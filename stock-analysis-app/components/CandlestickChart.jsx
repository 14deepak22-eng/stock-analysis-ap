"use client";

import { useMemo, useState, useRef, useCallback } from "react";

export default function CandlestickChart({ candles, support = [], resistance = [], height = 420 }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [mouseY, setMouseY] = useState(null);
  const [zoomRange, setZoomRange] = useState(null); // [startIdx, endIdx] or null = full
  const [dragStart, setDragStart] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [lines, setLines] = useState([]);
  const [pendingLine, setPendingLine] = useState(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  const totalLen = candles ? candles.length : 0;

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

  function currentRange() {
    return zoomRange ? [zoomRange[0], zoomRange[1]] : [0, totalLen - 1];
  }

  // Zoom in/out, keeping the point under the cursor (or center) fixed.
  function zoomAt(factor, anchorIdx) {
    const [start, end] = currentRange();
    const span = end - start;
    const newSpan = Math.max(5, Math.min(totalLen - 1, Math.round(span * factor)));
    if (newSpan >= totalLen - 1) {
      setZoomRange(null);
      return;
    }
    const anchor = anchorIdx != null ? anchorIdx : start + span / 2;
    const anchorRatio = span > 0 ? (anchor - start) / span : 0.5;
    let newStart = Math.round(anchor - anchorRatio * newSpan);
    let newEnd = newStart + newSpan;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalLen - 1) { newStart -= newEnd - (totalLen - 1); newEnd = totalLen - 1; }
    setZoomRange([Math.max(0, newStart), newEnd]);
  }

  function panBy(direction) {
    const [start, end] = currentRange();
    const span = end - start;
    const shift = Math.max(1, Math.round(span * 0.25)) * direction;
    let newStart = start + shift;
    let newEnd = end + shift;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalLen - 1) { newStart -= newEnd - (totalLen - 1); newEnd = totalLen - 1; }
    setZoomRange([Math.max(0, newStart), Math.min(totalLen - 1, newEnd)]);
  }

  function handleWheel(e) {
    e.preventDefault();
    const { x } = getSvgCoords(e);
    const idxUnderCursor = Math.floor((x - padding.left) / step);
    const [start] = currentRange();
    const absoluteIdx = start + Math.max(0, Math.min(visibleCandles.length - 1, idxUnderCursor));
    zoomAt(e.deltaY < 0 ? 0.8 : 1.25, absoluteIdx);
  }

  function handleMouseMove(e) {
    const { x, y } = getSvgCoords(e);
    const idx = Math.floor((x - padding.left) / step);
    if (idx >= 0 && idx < visibleCandles.length) setHoverIndex(idx);
    setMouseY(y);
    if (dragStart) setDragStart((prev) => ({ ...prev, currentX: x }));
    if (drawMode && pendingLine) setPendingLine((prev) => ({ ...prev, x2: x, y2: y }));
  }

  function handleMouseDown(e) {
    if (drawMode) {
      const { x, y } = getSvgCoords(e);
      if (!pendingLine) setPendingLine({ x1: x, y1: y, x2: x, y2: y });
      else { setLines((prev) => [...prev, pendingLine]); setPendingLine(null); }
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
        const endIdx = Math.min(visibleCandles.length - 1, Math.ceil((Math.max(startX, currentX) - padding.left) / step));
        const baseOffset = zoomRange ? zoomRange[0] : 0;
        if (endIdx > startIdx) setZoomRange([baseOffset + startIdx, baseOffset + endIdx]);
      }
      setDragStart(null);
    }
  }

  function handleDoubleClick() {
    setZoomRange(null);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
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
  const isZoomed = !!zoomRange;

  return (
    <div ref={containerRef} className="bg-white">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawMode((d) => !d)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition ${drawMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
          >
            ✏️ Draw line
          </button>
          {lines.length > 0 && (
            <button onClick={clearDrawings} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-500 transition">
              Clear drawings
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => panBy(-1)} disabled={!isZoomed} title="Pan left" className="text-xs w-8 h-8 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition disabled:opacity-30">
            ◀
          </button>
          <button onClick={() => zoomAt(1.4)} title="Zoom out" className="text-xs w-8 h-8 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
            −
          </button>
          <button onClick={() => zoomAt(0.7)} title="Zoom in" className="text-xs w-8 h-8 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
            +
          </button>
          <button onClick={() => panBy(1)} disabled={!isZoomed} title="Pan right" className="text-xs w-8 h-8 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition disabled:opacity-30">
            ▶
          </button>
          {isZoomed && (
            <button onClick={() => setZoomRange(null)} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition ml-1">
              🔍 Reset zoom
            </button>
          )}
          <button onClick={toggleFullscreen} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition ml-1">
            ⛶ Fullscreen
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-2">
        Scroll to zoom · drag to select a range · double-click to reset · toggle "Draw line" then click two points for a trendline.
      </p>

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
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        >
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

          {lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f59e0b" strokeWidth="2" />)}
          {pendingLine && <line x1={pendingLine.x1} y1={pendingLine.y1} x2={pendingLine.x2} y2={pendingLine.y2} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />}

          {dragStart && (
            <rect x={Math.min(dragStart.startX, dragStart.currentX)} y={padding.top} width={Math.abs(dragStart.currentX - dragStart.startX)} height={priceHeight - padding.top} fill="#4f46e5" opacity="0.1" />
          )}

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
