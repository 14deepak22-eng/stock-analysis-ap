"use client";

import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

export default function CandlestickChart({ candles, support = [], resistance = [], height = 460 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  // Create the chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: "#ffffff" }, textColor: "#475569" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626",
      borderUpColor: "#16a34a", borderDownColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#94a3b8",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleResize);
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data whenever candles/support/resistance change
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    const formatted = candles
      .map((c) => ({
        time: Math.floor(new Date(c.date).getTime() / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
      }))
      .filter((c) => c.time && !isNaN(c.time))
      .sort((a, b) => a.time - b.time);

    const volumeData = candles
      .map((c) => ({
        time: Math.floor(new Date(c.date).getTime() / 1000),
        value: c.volume || 0,
        color: c.close >= c.open ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)",
      }))
      .filter((c) => c.time && !isNaN(c.time))
      .sort((a, b) => a.time - b.time);

    seriesRef.current.setData(formatted);
    volumeSeriesRef.current.setData(volumeData);

    // Clear old price lines by resetting - lightweight-charts doesn't
    // expose a "clear all price lines" call, so we track and remove.
    (seriesRef.current._priceLines || []).forEach((pl) => seriesRef.current.removePriceLine(pl));
    seriesRef.current._priceLines = [];

    support?.slice(0, 2).forEach((s) => {
      const line = seriesRef.current.createPriceLine({
        price: s.level, color: "#16a34a", lineWidth: 1, lineStyle: 2, title: "Support " + s.level,
      });
      seriesRef.current._priceLines.push(line);
    });
    resistance?.slice(0, 2).forEach((r) => {
      const line = seriesRef.current.createPriceLine({
        price: r.level, color: "#dc2626", lineWidth: 1, lineStyle: 2, title: "Resistance " + r.level,
      });
      seriesRef.current._priceLines.push(line);
    });

    chartRef.current?.timeScale().fitContent();
  }, [candles, support, resistance]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.parentElement?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function resetZoom() {
    chartRef.current?.timeScale().fitContent();
  }

  if (!candles || candles.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-12">No candle data available for this range.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-2">
        <button onClick={resetZoom} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
          🔍 Fit to view
        </button>
        <button onClick={toggleFullscreen} className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 transition">
          ⛶ Fullscreen
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-2">Scroll to zoom · drag to pan · pinch to zoom on touch devices.</p>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
