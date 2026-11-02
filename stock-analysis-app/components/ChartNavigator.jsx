"use client";

import { useMemo, useRef } from "react";
import {
  centerRange,
  dragRange,
  formatChartTime,
  sparkPoints,
  zoomRange,
  RIGHT_PAD,
} from "@/lib/chartUtils";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SPARK_W = 1000;
const SPARK_H = 44;

/**
 * The slider bar under the chart: a mini price line of the WHOLE data set with
 * a highlighted window showing what the chart is currently displaying.
 *   - drag the window to scroll through time
 *   - drag either edge to zoom in or out
 *   - click anywhere on the bar to jump there
 *   - arrow keys scroll, + / - zoom, Home / End jump to the start / latest
 */
export default function ChartNavigator({ times, closes, range, onRangeChange, intraday }) {
  const n = closes.length;
  const trackRef = useRef(null);
  const dragRef = useRef(null);

  const path = useMemo(() => {
    const pts = sparkPoints(closes);
    if (pts.length < 2) return { line: "", area: "" };
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const span = hi - lo || 1;
    const x = (i) => (i / (n - 1)) * SPARK_W;
    const y = (v) => 5 + (1 - (v - lo) / span) * (SPARK_H - 10);
    const line = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    return { line, area: `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z` };
  }, [closes, n]);

  if (n < 2 || !range) {
    return <div className="h-[78px] rounded-xl bg-gray-50 border border-gray-100" aria-hidden="true" />;
  }

  const maxIdx = n - 1;
  const from = clamp(range.from, 0, maxIdx);
  const to = clamp(range.to, 0, maxIdx);
  const leftPct = (from / maxIdx) * 100;
  const widthPct = Math.max(((to - from) / maxIdx) * 100, 0.8);
  const rightPct = clamp(leftPct + widthPct, 0, 100);

  const idxFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * maxIdx;
  };

  const begin = (mode) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackRef.current.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, startIdx: idxFromEvent(e), start: { from: range.from, to: range.to } };
  };

  // Clicking the empty part of the bar re-centres the window there, then lets
  // you keep dragging from that point.
  const onTrackDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    trackRef.current.setPointerCapture?.(e.pointerId);
    const idx = idxFromEvent(e);
    const next = centerRange(idx, range, n);
    dragRef.current = { mode: "move", startIdx: idx, start: next };
    onRangeChange(next);
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onRangeChange(dragRange(d.mode, d.start, idxFromEvent(e) - d.startIdx, n));
  };

  const end = (e) => {
    if (dragRef.current) {
      trackRef.current?.releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  };

  const onKeyDown = (e) => {
    const width = range.to - range.from;
    const step = Math.max(1, width * (e.shiftKey ? 0.5 : 0.1));
    let next = null;
    if (e.key === "ArrowLeft") next = dragRange("move", range, -step, n);
    else if (e.key === "ArrowRight") next = dragRange("move", range, step, n);
    else if (e.key === "+" || e.key === "=") next = zoomRange(range, 0.7, n);
    else if (e.key === "-" || e.key === "_") next = zoomRange(range, 1 / 0.7, n);
    else if (e.key === "Home") next = dragRange("move", range, -n, n);
    else if (e.key === "End") next = dragRange("move", range, n + RIGHT_PAD, n);
    if (next) {
      e.preventDefault();
      onRangeChange(next);
    }
  };

  const firstVisible = Math.round(from);
  const lastVisible = Math.round(to);
  const label = (i) => formatChartTime(times[clamp(i, 0, maxIdx)], intraday);

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-[52px] rounded-xl bg-slate-50 border border-slate-200 overflow-hidden cursor-pointer"
        style={{ touchAction: "none" }}
        onPointerDown={onTrackDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <path d={path.area} fill="rgba(99,102,241,0.12)" />
          <path d={path.line} fill="none" stroke="#6366f1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* dim everything outside the visible window */}
        <div className="absolute top-0 bottom-0 left-0 bg-slate-900/10 pointer-events-none" style={{ width: `${leftPct}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-slate-900/10 pointer-events-none" style={{ width: `${100 - rightPct}%` }} />

        {/* the draggable window */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Chart time range - use arrow keys to scroll, plus and minus to zoom"
          aria-valuemin={0}
          aria-valuemax={maxIdx}
          aria-valuenow={firstVisible}
          aria-valuetext={`${label(firstVisible)} to ${label(lastVisible)}`}
          onKeyDown={onKeyDown}
          onPointerDown={begin("move")}
          className="absolute top-0 bottom-0 border-y-2 border-indigo-500 bg-indigo-500/10 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          <div
            onPointerDown={begin("left")}
            className="absolute -left-1 top-0 bottom-0 w-3 cursor-ew-resize bg-indigo-500 rounded-l-md flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="block w-0.5 h-4 bg-white/80 rounded" />
          </div>
          <div
            onPointerDown={begin("right")}
            className="absolute -right-1 top-0 bottom-0 w-3 cursor-ew-resize bg-indigo-500 rounded-r-md flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="block w-0.5 h-4 bg-white/80 rounded" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-gray-400">
        <span>{formatChartTime(times[0], intraday)}</span>
        <span className="text-gray-500 text-center">
          Showing {label(firstVisible)} → {label(lastVisible)} · {Math.max(1, lastVisible - firstVisible + 1)} bars
        </span>
        <span>{formatChartTime(times[maxIdx], intraday)}</span>
      </div>
    </div>
  );
}
