"use client";

import { useState, useEffect, useCallback } from "react";
import CandlestickChart from "@/components/CandlestickChart";
import RsiPanel from "@/components/RsiPanel";
import IntervalSelector from "@/components/IntervalSelector";
import PaperTradeWidget from "@/components/PaperTradeWidget";

function scoreTier(score) {
  if (score == null) return "mid";
  if (score >= 65) return "good";
  if (score >= 40) return "mid";
  return "bad";
}

export default function TradingDetailPage({ params }) {
  const symbol = params.symbol.toUpperCase();

  const [pick, setPick] = useState(null);
  const [candles, setCandles] = useState([]);
  const [interval, setIntervalKey] = useState("1day");
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [livePrice, setLivePrice] = useState(null);
  const [ai, setAi] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Load this symbol's scan data (patterns, support/resistance, backtest)
  useEffect(() => {
    fetch("/api/trading")
      .then((r) => r.json())
      .then((data) => {
        const match = (data.picks || []).find((p) => p.symbol === symbol);
        setPick(match || null);
        if (match?.ai_signal?.overallRead) setAi(match.ai_signal);
      });
  }, [symbol]);

  // Load candles whenever interval changes
   const [candlesError, setCandlesError] = useState(null);

  const loadCandles = useCallback(() => {
    setLoadingCandles(true);
    setCandlesError(null);
    fetch(`/api/trading/candles?symbol=${symbol}&interval=${interval}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setCandlesError(data.error);
          setCandles([]);
        } else {
          setCandles(data.candles || []);
        }
        setLoadingCandles(false);
      })
      .catch((err) => {
        setCandlesError(err.message);
        setLoadingCandles(false);
      });
  }, [symbol, interval]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  // Live price polling
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/trading/live-prices?symbols=${symbol}`);
        const data = await res.json();
        setLivePrice(data.prices?.[symbol] ?? null);
      } catch {
        // keep last known price on failure
      }
    }
    poll();
    const id = setInterval(poll, 12000);
    return () => clearInterval(id);
  }, [symbol]);

  async function handleAnalyze() {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/trading/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.aiSignal) setAi(data.aiSignal);
    } finally {
      setLoadingAi(false);
    }
  }

  const tier = scoreTier(pick?.trading_opportunity_score);
  const badgeClass = tier === "good" ? "score-badge-good" : tier === "bad" ? "score-badge-bad" : "score-badge-mid";
  const rr = pick?.ai_signal?.riskReward;
  const displayPrice = livePrice ?? pick?.current_price;

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{symbol}</h1>
          {pick && (
            <span className={`${badgeClass} text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg pop-in`}>
              🎯 {pick.trading_opportunity_score}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">₹{displayPrice?.toLocaleString() ?? "-"}</span>
          {livePrice && <span className="text-xs text-green-600 animate-pulse">● live</span>}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Full technical view — not investment advice.
      </p>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">📈 Candlestick chart</h2>
          <IntervalSelector selected={interval} onChange={setIntervalKey} disabled={loadingCandles} />
        </div>
               {loadingCandles ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : candlesError ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-500 mb-3">Couldn't load chart data: {candlesError}</p>
            <button onClick={loadCandles} className="btn-primary px-4 py-2 rounded-lg text-sm">
              Try again
            </button>
          </div>
        ) : (
          <>
            <CandlestickChart candles={candles} support={pick?.support_levels} resistance={pick?.resistance_levels} />
            <div className="mt-3 border-t pt-3">
              <RsiPanel candles={candles} />
            </div>
          </>
        )}
      </div>

      {pick && (
        <div className="mb-6">
          <h2 className="font-semibold text-gray-800 mb-2 text-sm">🔍 Detected patterns</h2>
          {pick.detected_patterns?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pick.detected_patterns.map((p, i) => (
                <span
                  key={i}
                  title={p.detail}
                  className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1.5 rounded-full font-medium cursor-help"
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No specific pattern detected in the current data — this is common and not an error.</p>
          )}
        </div>
      )}

      {pick && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-3">📊 Technical signals</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-gray-400 text-xs">RSI</p><p className="font-bold">{pick.technicals?.rsi?.toFixed(1) ?? "-"}</p></div>
              <div><p className="text-gray-400 text-xs">50-day avg</p><p className="font-bold">₹{pick.technicals?.ma50?.toFixed(2) ?? "-"}</p></div>
              <div><p className="text-gray-400 text-xs">200-day avg</p><p className="font-bold">₹{pick.technicals?.ma200?.toFixed(2) ?? "-"}</p></div>
              <div><p className="text-gray-400 text-xs">Volume trend</p><p className="font-bold">{pick.technicals?.recentVolume > pick.technicals?.avgVolume ? "Above avg" : "Below avg"}</p></div>
            </div>
          </div>

          {rr && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-800 mb-3">🎯 Risk-reward levels</h2>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="negative-pill rounded-xl p-2"><p className="text-xs opacity-70">Stop-loss</p><p className="font-bold">₹{rr.stopLoss}</p></div>
                <div className="bg-indigo-50 text-indigo-700 rounded-xl p-2"><p className="text-xs opacity-70">Entry ref.</p><p className="font-bold">₹{rr.entry}</p></div>
                <div className="positive-pill rounded-xl p-2"><p className="text-xs opacity-70">Target</p><p className="font-bold">₹{rr.target}</p></div>
              </div>
              {rr.riskRewardRatio && <p className="text-xs text-gray-500 mt-2">Risk-reward: 1:{rr.riskRewardRatio}</p>}
            </div>
          )}
        </div>
      )}

      {pick?.backtest?.winRate != null && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-2">📊 Historical backtest</h2>
          <p className="text-sm text-gray-700">
            {pick.backtest.winRate}% of similar past setups moved higher over the following {pick.backtest.lookaheadDays} days,
            averaging {pick.backtest.avgReturn}% return, based on {pick.backtest.sampleSize} historical occurrences.
          </p>
        </div>
      )}

      <div className="mb-6">
        {ai ? (
          <div className="rounded-2xl p-5 shadow-lg pop-in" style={{ background: "linear-gradient(90deg, #6366f1, #0ea5e9)", color: "#fff" }}>
            <h2 className="font-semibold mb-1">🤖 AI analysis</h2>
            <p className="text-sm mb-2" style={{ color: "rgba(255,255,255,0.92)" }}>{ai.overallRead}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>{ai.reasoning}</p>
          </div>
        ) : (
          <button
            onClick={handleAnalyze}
            disabled={loadingAi}
            className="w-full card card-hover p-4 text-sm text-indigo-700 font-medium flex items-center justify-center gap-2"
          >
            {loadingAi && <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />}
            {loadingAi ? "Analyzing…" : "🤖 Get AI analysis for this stock"}
          </button>
        )}
      </div>

      <div className="mb-6">
        <PaperTradeWidget symbol={symbol} livePrice={livePrice} />
      </div>

      <p className="text-xs text-gray-400">
        This information is for informational purposes only and is not investment advice. Entry, stop-loss, and target levels are calculated reference points, not guarantees. Please consult a SEBI-registered advisor before making investment decisions.
      </p>
    </div>
  );
}
