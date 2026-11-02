"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import ChartNavigator from "@/components/ChartNavigator";
import {
  RIGHT_PAD,
  defaultRange,
  formatChartTime,
  fullRange,
  isIntradayInterval,
  prepareBars,
  presetRange,
  presetsForInterval,
  rsiWilder,
  sma,
} from "@/lib/chartUtils";

const PREFS_KEY = "stockscope.chartPrefs.v1";
const DEFAULT_PREFS = { chartType: "candles", volume: true, ma20: false, ma50: false, ma200: false, rsi: true };

const UP = "#16a34a";
const DOWN = "#dc2626";
const MA_COLORS = { ma20: "#f59e0b", ma50: "#8b5cf6", ma200: "#0f172a" };

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / blocked storage: preferences just won't be remembered
  }
}

const btnBase = "text-xs px-2.5 py-1.5 rounded-lg font-medium border transition whitespace-nowrap";
const btnOff = "bg-white text-gray-600 border-gray-200 hover:border-indigo-300";
const btnOn = "bg-indigo-50 text-indigo-700 border-indigo-300";

export default function CandlestickChart({
  symbol = "",
  candles,
  support = [],
  resistance = [],
  interval = "1day",
  toolbarLeft = null,
  loading = false,
  error = null,
  onRetry,
  height = 460,
}) {
  const rootRef = useRef(null);
  const mainRef = useRef(null);
  const rsiElRef = useRef(null);
  const chartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const seriesRef = useRef({});
  const priceLinesRef = useRef([]);
  const syncingRef = useRef(false);

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [range, setRange] = useState(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [nativeFull, setNativeFull] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);
  const isFull = nativeFull || pseudoFull;

  const intraday = isIntradayInterval(interval);

  const bars = useMemo(() => prepareBars(candles), [candles]);
  const times = useMemo(() => bars.map((b) => b.time), [bars]);
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const rsiValues = useMemo(() => rsiWilder(closes, 14), [closes]);
  const barIndexByTime = useMemo(() => new Map(bars.map((b, i) => [b.time, i])), [bars]);

  // Remember the user's indicator choices between visits.
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  const updatePref = (patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  };

  // ---- Create both charts once ------------------------------------------
  useEffect(() => {
    const mainEl = mainRef.current;
    const rsiEl = rsiElRef.current;
    if (!mainEl || !rsiEl) return;

    const common = {
      layout: { background: { color: "#ffffff" }, textColor: "#475569", fontSize: 12 },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0", minimumWidth: 64 },
      localization: { priceFormatter: (p) => p.toFixed(2) },
    };

    const chart = createChart(mainEl, {
      ...common,
      width: mainEl.clientWidth || 600,
      height: mainEl.clientHeight || height,
      timeScale: { borderColor: "#e2e8f0", timeVisible: true, secondsVisible: false, rightOffset: RIGHT_PAD, minBarSpacing: 0.4 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candle = chart.addCandlestickSeries({
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
    });
    const line = chart.addLineSeries({ color: "#4f46e5", lineWidth: 2, visible: false, crosshairMarkerVisible: true });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const maOptions = (color) => ({
      color, lineWidth: 1, visible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    });
    const ma20 = chart.addLineSeries(maOptions(MA_COLORS.ma20));
    const ma50 = chart.addLineSeries(maOptions(MA_COLORS.ma50));
    const ma200 = chart.addLineSeries(maOptions(MA_COLORS.ma200));

    // RSI lives in its own small chart below, kept in step with the main one.
    const rsiChart = createChart(rsiEl, {
      ...common,
      width: rsiEl.clientWidth || 600,
      height: rsiEl.clientHeight || 120,
      rightPriceScale: { borderColor: "#e2e8f0", minimumWidth: 64, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { visible: false, rightOffset: RIGHT_PAD, minBarSpacing: 0.4 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const rsiSeries = rsiChart.addLineSeries({
      color: "#4f46e5", lineWidth: 2, lastValueVisible: true, priceLineVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    rsiSeries.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
    rsiSeries.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });

    chartRef.current = chart;
    rsiChartRef.current = rsiChart;
    seriesRef.current = { candle, line, volume, ma20, ma50, ma200, rsi: rsiSeries };

    // Keep both time axes identical, and report the visible range to the navigator.
    const link = (from, to) => (r) => {
      if (!r) return;
      setRange({ from: r.from, to: r.to });
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        to.timeScale().setVisibleLogicalRange(r);
      } finally {
        syncingRef.current = false;
      }
    };
    const onMain = link(chart, rsiChart);
    const onRsi = (r) => {
      if (!r || syncingRef.current) return;
      syncingRef.current = true;
      try {
        chart.timeScale().setVisibleLogicalRange(r);
      } finally {
        syncingRef.current = false;
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onMain);
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(onRsi);

    const onCrosshair = (param) => setHoverTime(param && param.time ? param.time : null);
    chart.subscribeCrosshairMove(onCrosshair);

    // Resize whenever the containers change size (window resize, entering or
    // leaving full screen, the RSI pane being toggled).
    const ro = new ResizeObserver(() => {
      if (mainEl.clientWidth > 0 && mainEl.clientHeight > 0) chart.resize(mainEl.clientWidth, mainEl.clientHeight);
      if (rsiEl.clientWidth > 0 && rsiEl.clientHeight > 0) rsiChart.resize(rsiEl.clientWidth, rsiEl.clientHeight);
    });
    ro.observe(mainEl);
    ro.observe(rsiEl);

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onMain);
      rsiChart.timeScale().unsubscribeVisibleLogicalRangeChange(onRsi);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      rsiChart.remove();
      chartRef.current = null;
      rsiChartRef.current = null;
      seriesRef.current = {};
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Push data into the charts ----------------------------------------
  useEffect(() => {
    const s = seriesRef.current;
    if (!s.candle) return;

    s.candle.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    s.line.setData(bars.map((b) => ({ time: b.time, value: b.close })));
    s.volume.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)",
      }))
    );

    const setSeriesFrom = (series, values) => {
      series.setData(values.map((v, i) => (v == null ? null : { time: bars[i].time, value: v })).filter(Boolean));
    };
    setSeriesFrom(s.ma20, sma(closes, 20));
    setSeriesFrom(s.ma50, sma(closes, 50));
    setSeriesFrom(s.ma200, sma(closes, 200));
    setSeriesFrom(s.rsi, rsiValues);

    const r = defaultRange(bars.length);
    if (r) chartRef.current.timeScale().setVisibleLogicalRange(r);
  }, [bars, closes, rsiValues]);

  // ---- Support / resistance lines ---------------------------------------
  useEffect(() => {
    const s = seriesRef.current;
    if (!s.candle) return;
    priceLinesRef.current.forEach((pl) => s.candle.removePriceLine(pl));
    priceLinesRef.current = [];
    const add = (level, color, title) => {
      if (typeof level !== "number" || !Number.isFinite(level)) return;
      priceLinesRef.current.push(
        s.candle.createPriceLine({ price: level, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title })
      );
    };
    (support || []).slice(0, 2).forEach((x) => add(x?.level, UP, "Support"));
    (resistance || []).slice(0, 2).forEach((x) => add(x?.level, DOWN, "Resistance"));
  }, [support, resistance, bars]);

  // ---- Apply the toggles -------------------------------------------------
  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s.candle || !chart) return;
    s.candle.applyOptions({ visible: prefs.chartType === "candles" });
    s.line.applyOptions({ visible: prefs.chartType === "line" });
    s.volume.applyOptions({ visible: prefs.volume });
    s.ma20.applyOptions({ visible: prefs.ma20 });
    s.ma50.applyOptions({ visible: prefs.ma50 });
    s.ma200.applyOptions({ visible: prefs.ma200 });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: prefs.volume ? 0.22 : 0.06 } });
  }, [prefs, bars]);

  // ---- Full screen -------------------------------------------------------
  useEffect(() => {
    const onChange = () => setNativeFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Browsers that can't fullscreen an element (notably iPhone Safari) get a
  // full-viewport overlay instead; Esc closes it and the page behind stops scrolling.
  useEffect(() => {
    if (!pseudoFull) return;
    const onKey = (e) => e.key === "Escape" && setPseudoFull(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [pseudoFull]);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen?.();
      return;
    }
    if (pseudoFull) {
      setPseudoFull(false);
      return;
    }
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // blocked or unsupported here - use the overlay instead
      }
    }
    setPseudoFull(true);
  }, [pseudoFull]);

  // ---- View helpers ------------------------------------------------------
  const setVisibleRange = useCallback((r) => {
    if (r && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(r);
  }, []);

  const presets = presetsForInterval(interval);

  // ---- Legend ------------------------------------------------------------
  const legendIndex = hoverTime != null && barIndexByTime.has(hoverTime) ? barIndexByTime.get(hoverTime) : bars.length - 1;
  const bar = bars[legendIndex];
  const prevClose = legendIndex > 0 ? bars[legendIndex - 1].close : null;
  const change = bar && prevClose ? bar.close - prevClose : null;
  const changePct = change != null ? (change / prevClose) * 100 : null;
  const rsiNow = bar ? rsiValues[legendIndex] : null;
  const changeColor = change == null ? "#64748b" : change >= 0 ? UP : DOWN;

  const hasData = bars.length > 0;
  const showEmpty = !loading && !error && !hasData;

  const rootClass = isFull
    ? `flex flex-col bg-white p-3 sm:p-4 ${pseudoFull ? "fixed inset-0" : "w-screen h-screen"}`
    : "";
  const rootStyle = pseudoFull ? { zIndex: 1000 } : undefined;

  return (
    <div ref={rootRef} className={rootClass} style={rootStyle}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          {toolbarLeft}
          <div className="flex items-center gap-1" role="group" aria-label="Quick range">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setVisibleRange(presetRange(times, p))}
                disabled={!hasData}
                className={`${btnBase} ${btnOff} disabled:opacity-40`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-lg overflow-hidden border border-gray-200" role="group" aria-label="Chart type">
            {[
              ["candles", "Candles"],
              ["line", "Line"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => updatePref({ chartType: key })}
                className={`text-xs px-2.5 py-1.5 font-medium transition ${prefs.chartType === key ? "bg-indigo-50 text-indigo-700" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {[
            ["volume", "Vol"],
            ["ma20", "MA20"],
            ["ma50", "MA50"],
            ["ma200", "MA200"],
            ["rsi", "RSI"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => updatePref({ [key]: !prefs[key] })}
              aria-pressed={prefs[key]}
              className={`${btnBase} ${prefs[key] ? btnOn : btnOff}`}
              title={`Show / hide ${label}`}
            >
              {MA_COLORS[key] && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: MA_COLORS[key] }} />}
              {label}
            </button>
          ))}
          <button onClick={() => setVisibleRange(fullRange(bars.length))} disabled={!hasData} className={`${btnBase} ${btnOff} disabled:opacity-40`}>
            Fit all
          </button>
          <button onClick={toggleFullscreen} className={`${btnBase} ${isFull ? btnOn : btnOff}`} aria-pressed={isFull}>
            {isFull ? "✕ Exit full screen" : "⛶ Full screen"}
          </button>
        </div>
      </div>

      {/* Main chart */}
      <div className="relative" style={isFull ? { flex: "1 1 0", minHeight: 0 } : { height }}>
        <div ref={mainRef} className="absolute inset-0 overflow-hidden" />

        {hasData && bar && (
          <div className="absolute top-1.5 left-2 right-16 z-[2] pointer-events-none text-[11px] sm:text-xs leading-5 bg-white/80 rounded-md px-1.5">
            <span className="font-semibold text-gray-700">{symbol}</span>
            <span className="text-gray-400"> · {formatChartTime(bar.time, intraday)} · </span>
            <span className="hidden sm:inline">
              <span className="text-gray-500">O </span><span style={{ color: changeColor }}>{money.format(bar.open)}</span>
              <span className="text-gray-500"> H </span><span style={{ color: changeColor }}>{money.format(bar.high)}</span>
              <span className="text-gray-500"> L </span><span style={{ color: changeColor }}>{money.format(bar.low)}</span>
            </span>
            <span className="text-gray-500"> C </span><span style={{ color: changeColor }}>{money.format(bar.close)}</span>
            {change != null && (
              <span style={{ color: changeColor }}>
                {" "}
                {change >= 0 ? "+" : ""}
                {money.format(change)} ({change >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            )}
            <span className="hidden sm:inline">
              <span className="text-gray-500"> Vol </span><span className="text-gray-700">{compact.format(bar.volume)}</span>
            </span>
            {prefs.rsi && rsiNow != null && (
              <>
                <span className="text-gray-500"> RSI </span>
                <span style={{ color: rsiNow > 70 ? DOWN : rsiNow < 30 ? UP : "#475569" }}>{rsiNow.toFixed(1)}</span>
              </>
            )}
          </div>
        )}

        {(loading || error || showEmpty) && (
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-white/85 text-center px-6">
            {loading && (
              <>
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Loading chart…</p>
              </>
            )}
            {!loading && error && (
              <>
                <p className="text-sm text-red-500 max-w-md">Couldn&apos;t load chart data: {error}</p>
                {onRetry && (
                  <button onClick={onRetry} className="btn-primary px-4 py-2 rounded-lg text-sm">
                    Try again
                  </button>
                )}
              </>
            )}
            {showEmpty && <p className="text-sm text-gray-400">No candle data available for this range.</p>}
          </div>
        )}
      </div>

      {/* RSI pane (always mounted so the charts stay in sync; hidden when switched off) */}
      <div style={{ display: prefs.rsi ? "block" : "none" }} className="mt-1 border-t border-gray-100 pt-1">
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span className="font-semibold">RSI (14)</span>
          <span className="text-gray-400">above 70 overbought · below 30 oversold</span>
        </div>
        <div ref={rsiElRef} className="relative overflow-hidden" style={{ height: isFull ? 150 : 120 }} />
      </div>

      {/* Navigator slider */}
      <div className="mt-3">
        <ChartNavigator times={times} closes={closes} range={range} onRangeChange={setVisibleRange} intraday={intraday} />
      </div>

      <p className="text-[11px] text-gray-400 mt-2">
        Drag the bar above to scroll, drag its edges to zoom · scroll wheel or pinch zooms the chart · drag the chart to pan
        {isFull ? " · Esc exits full screen" : ""}.
      </p>
    </div>
  );
}
