"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

function scoreTier(score) {
  if (score >= 65) return "good";
  if (score >= 40) return "mid";
  return "bad";
}

export default function TradingSignalCard({ pick, livePrice }) {
  const [ai, setAi] = useState(pick.ai_signal?.overallRead ? pick.ai_signal : null);
  const [loadingAi, setLoadingAi] = useState(false);

  const tier = scoreTier(pick.trading_opportunity_score);
  const badgeClass = tier === "good" ? "score-badge-good" : tier === "bad" ? "score-badge-bad" : "score-badge-mid";

  const chartData = (pick.price_history || []).map((c) => ({ date: c.date, close: c.close }));
  const displayPrice = livePrice ?? pick.current_price;
  const priceChangeFromScan = livePrice ? (((livePrice - pick.current_price) / pick.current_price) * 100).toFixed(2) : null;

  const rr = pick.ai_signal?.riskReward || {};

  async function handleAnalyze() {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/trading/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: pick.symbol }),
      });
      const data = await res.json();
      if (data.aiSignal) setAi(data.aiSignal);
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <div className="card card-hover p-5 pop-in">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-400">#{pick.rank}</span>
          <a href={`/trading/${pick.symbol}`} className="text-xl font-bold text-indigo-700 hover:underline">
            {pick.symbol}
          </a>
        </div>
        <span className={`${badgeClass} text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg`}>
          🎯 {pick.trading_opportunity_score}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold">₹{displayPrice?.toLocaleString()}</span>
        {priceChangeFromScan != null && (
          <span className={`text-sm font-semibold ${priceChangeFromScan >= 0 ? "text-green-600" : "text-red-600"}`}>
            {priceChangeFromScan >= 0 ? "▲" : "▼"} {Math.abs(priceChangeFromScan)}% since scan
          </span>
        )}
        {livePrice && <span className="text-xs text-gray-400 animate-pulse">● live</span>}
      </div>

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
            <Tooltip />
            {pick.support_levels?.slice(0, 1).map((s, i) => (
              <ReferenceLine key={"s" + i} y={s.level} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "Support", fontSize: 10, fill: "#16a34a" }} />
            ))}
            {pick.resistance_levels?.slice(0, 1).map((r, i) => (
              <ReferenceLine key={"r" + i} y={r.level} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "Resistance", fontSize: 10, fill: "#dc2626" }} />
            ))}
            <Line type="monotone" dataKey="close" stroke="#4f46e5" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="mb-3">
        <h2 className="font-semibold text-gray-800 mb-1.5 text-sm">🔍 Detected patterns</h2>
        {pick.detected_patterns?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {pick.detected_patterns.map((p, i) => (
              <span key={i} title={p.detail} className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full font-medium cursor-help">
                {p.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No specific pattern detected — this is common and not an error.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 my-3 text-center text-sm">
        <div className="negative-pill rounded-xl p-2">
          <p className="text-xs opacity-70">Stop-loss</p>
          <p className="font-bold">₹{rr.stopLoss?.toLocaleString() ?? "-"}</p>
        </div>
        <div className="bg-indigo-50 text-indigo-700 rounded-xl p-2">
          <p className="text-xs opacity-70">Entry ref.</p>
          <p className="font-bold">₹{rr.entry?.toLocaleString() ?? "-"}</p>
        </div>
        <div className="positive-pill rounded-xl p-2">
          <p className="text-xs opacity-70">Target</p>
          <p className="font-bold">₹{rr.target?.toLocaleString() ?? "-"}</p>
        </div>
      </div>

      {rr.riskRewardRatio && (
        <p className="text-xs text-gray-500 mb-2">Risk-reward ratio: <span className="font-semibold">1:{rr.riskRewardRatio}</span></p>
      )}

      {ai ? (
        <div className="bg-gray-50 rounded-xl p-3 text-sm">
          <p className="font-medium text-gray-800 mb-1">{ai.overallRead}</p>
          <p className="text-gray-600 text-xs">{ai.reasoning}</p>
        </div>
      ) : (
        <button
          onClick={handleAnalyze}
          disabled={loadingAi}
          className="w-full text-sm border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 px-4 py-2.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition"
        >
          {loadingAi && <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />}
          {loadingAi ? "Analyzing…" : "🤖 Get AI analysis"}
        </button>
      )}

      {pick.backtest?.winRate != null && (
        <p className="text-xs text-gray-400 mt-2">
          📊 Historical setups like this: {pick.backtest.winRate}% moved higher over the next {pick.backtest.lookaheadDays} days ({pick.backtest.sampleSize} samples)
        </p>
      )}

      {ai?.disclaimer && <p className="text-xs text-gray-400 mt-3 italic">{ai.disclaimer}</p>}
    </div>
  );
}
