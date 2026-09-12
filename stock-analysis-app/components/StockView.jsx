"use client";

import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { addToDashboard, saveStockSummary, saveFullStockData } from "@/lib/dashboard";
import { addToUserDashboard } from "@/lib/userDashboard";
import RsiGauge from "@/components/RsiGauge";
import RatioRadar from "@/components/RatioRadar";
import SectorComparison from "@/components/SectorComparison";
import PriceChart from "@/components/PriceChart";

const RATIO_BENCHMARKS = [
  { key: "pe_ratio", label: "P/E Ratio", acceptable: "Lower is generally better (compare to sector)", isGood: (v) => v != null && v > 0 && v < 30 },
  { key: "peg_ratio", label: "PEG Ratio", acceptable: "Below 1.5 is considered attractive", isGood: (v) => v != null && v < 1.5 },
  { key: "roe", label: "Return on Equity (ROE)", acceptable: "Above 15% is considered strong", isGood: (v) => v != null && v > 15 },
  { key: "roce", label: "Return on Capital Employed (ROCE)", acceptable: "Above 15% is considered strong", isGood: (v) => v != null && v > 15 },
  { key: "debt_to_equity", label: "Debt to Equity", acceptable: "Below 1 is considered safe", isGood: (v) => v != null && v < 1 },
  { key: "current_ratio", label: "Current Ratio", acceptable: "Between 1.5 and 3 is considered healthy", isGood: (v) => v != null && v >= 1.5 && v <= 3 },
  { key: "promoter_holding", label: "Promoter Holding %", acceptable: "Above 50% often seen as strong commitment", isGood: (v) => v != null && v > 50 },
  { key: "dividend_yield", label: "Dividend Yield %", acceptable: "Context dependent - higher isn't always better", isGood: (v) => v != null && v > 1 },
];

const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#94a3b8"];

function scoreTier(score) {
  if (score == null) return "mid";
  if (score >= 65) return "good";
  if (score >= 40) return "mid";
  return "bad";
}

function ScoreBadge({ title, score, analysis, icon }) {
  const tier = scoreTier(score);
  const badgeClass = tier === "good" ? "score-badge-good" : tier === "bad" ? "score-badge-bad" : "score-badge-mid";
  const textClass = tier === "good" ? "score-good" : tier === "bad" ? "score-bad" : "score-mid";

  return (
    <div className="card card-hover p-5 pop-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <span>{icon}</span> {title}
        </h2>
        <span className={`${badgeClass} text-white text-2xl font-bold w-16 h-16 rounded-full flex items-center justify-center shadow-lg`}>
          {score ?? "-"}
        </span>
      </div>
      {analysis ? (
        <>
          <p className="text-sm text-gray-700 mb-3">{analysis.summary}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="font-medium text-green-700 mb-1.5">✓ Strengths</p>
              <ul className="text-gray-600 space-y-1">
                {(analysis.strengths || []).map((s, i) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="font-medium text-amber-700 mb-1.5">⚠ Concerns</p>
              <ul className="text-gray-600 space-y-1">
                {(analysis.concerns || []).map((c, i) => <li key={i}>• {c}</li>)}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">Not yet computed for this stock.</p>
      )}
    </div>
  );
}

export default function StockView({ symbol, initialData }) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    addToDashboard(symbol);
    saveStockSummary(symbol, data);
    saveFullStockData(symbol, data);
    addToUserDashboard(symbol);
  }, [symbol, data]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/stock/${symbol}?refresh=true`);
      setData(await res.json());
    } finally {
      setRefreshing(false);
    }
  }

  const { score, analysis } = data;
  const raw = analysis?.raw_metrics || {};
  const overallTier = scoreTier(score?.overall_score);

  const knownHoldings = [
    { name: "Promoter", value: raw.promoter_holding },
    { name: "FII", value: raw.fii_holding },
    { name: "DII", value: raw.dii_holding },
  ].filter((d) => typeof d.value === "number" && d.value > 0);

  const knownTotal = knownHoldings.reduce((sum, d) => sum + d.value, 0);
  const remainder = Math.max(0, 100 - knownTotal);

  const holdingsData =
    knownHoldings.length > 0
      ? [...knownHoldings, ...(remainder > 0.5 ? [{ name: "Other", value: Number(remainder.toFixed(1)) }] : [])]
      : [];

  const returnsData = [
    { period: "1W", value: raw.return_1w },
    { period: "1M", value: raw.return_1m },
    { period: "3M", value: raw.return_3m },
    { period: "6M", value: raw.return_6m },
    { period: "1Y", value: raw.return_1y },
    { period: "3Y", value: raw.return_3y },
    { period: "5Y", value: raw.return_5y },
  ].filter((d) => typeof d.value === "number");

  const ma50 = raw.price && raw.price_vs_50dma_pct != null ? raw.price / (1 + raw.price_vs_50dma_pct / 100) : null;
  const ma200 = raw.price && raw.price_vs_200dma_pct != null ? raw.price / (1 + raw.price_vs_200dma_pct / 100) : null;

  const newsTier = analysis?.news_analysis?.sentiment === "Positive" ? "positive-pill"
    : analysis?.news_analysis?.sentiment === "Negative" ? "negative-pill" : "neutral-pill";
  const newsEmoji = analysis?.news_analysis?.sentiment === "Positive" ? "📈"
    : analysis?.news_analysis?.sentiment === "Negative" ? "📉" : "➖";

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{symbol}</h1>
          {score?.overall_score != null && (
            <span className={`${overallTier === "good" ? "score-badge-good" : overallTier === "bad" ? "score-badge-bad" : "score-badge-mid"} text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg pop-in`}>
              ⭐ Overall {score.overall_score}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 px-4 py-2 rounded-xl disabled:opacity-50 flex items-center gap-2 transition"
        >
          {refreshing && <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />}
          {refreshing ? "Refreshing…" : "🔄 Refresh data"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Data as of {score?.score_date ?? "unknown"} · {data.cached ? "saved data — click Refresh for the latest" : "just fetched"} — not investment advice.
      </p>

      {analysis?.verdict?.summary && (
        <div className="rounded-2xl p-5 mb-6 bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg pop-in">
          <h2 className="font-semibold mb-1 flex items-center gap-2">💡 Overview</h2>
          <p className="text-sm text-white/90">{analysis.verdict.summary}</p>
        </div>
      )}

      <div className="grid gap-4 mb-6">
        <ScoreBadge title="Investment score" score={score?.investment_score} analysis={analysis?.investment_analysis} icon="🏛️" />
        <ScoreBadge title="Trading score" score={score?.trading_score} analysis={analysis?.trading_analysis} icon="📊" />
        <div className={`card p-5 flex items-center justify-between stagger-item`}>
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">📰 News sentiment</h2>
            <p className="text-sm text-gray-600">{analysis?.news_analysis?.reasoning}</p>
          </div>
          <span className={`${newsTier} px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap ml-4`}>
            {newsEmoji} {analysis?.news_analysis?.sentiment ?? "Unknown"}
          </span>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-1">📋 Key ratios vs. general benchmarks</h2>
        <p className="text-xs text-gray-400 mb-3">
          Sourced from BharatStock. Ratio formulas vary by provider (e.g. ROCE definitions differ), so figures may not exactly match other platforms — treat as directional, and cross-check anything decision-critical.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b">
              <th className="pb-2">Metric</th>
              <th className="pb-2">This stock</th>
              <th className="pb-2">Generally acceptable</th>
              <th className="pb-2">Check</th>
            </tr>
          </thead>
          <tbody>
            {RATIO_BENCHMARKS.map((b) => {
              const value = raw[b.key];
              const good = b.isGood(value);
              return (
                <tr key={b.key} className={`border-b last:border-0 transition ${value == null ? "" : good ? "hover:bg-green-50" : "hover:bg-amber-50"}`}>
                  <td className="py-2.5 text-gray-700">{b.label}</td>
                  <td className="py-2.5 font-bold">{value != null ? value.toLocaleString() : "-"}</td>
                  <td className="py-2.5 text-gray-500">{b.acceptable}</td>
                  <td className="py-2.5">
                    {value == null ? (
                      <span className="text-gray-300">-</span>
                    ) : good ? (
                      <span className="positive-pill px-2.5 py-1 rounded-full text-xs font-semibold">✓ Good</span>
                    ) : (
                      <span className="negative-pill px-2.5 py-1 rounded-full text-xs font-semibold">⚠ Watch</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-6">
        <PriceChart priceHistory={raw.price_history} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <RatioRadar raw={raw} />
        <SectorComparison raw={raw} />
      </div>

      {raw.rsi != null && (
        <div className="card p-5 mb-6 flex justify-center">
          <RsiGauge rsi={raw.rsi} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {holdingsData.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-3">🥧 Shareholding pattern</h2>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={holdingsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(d) => `${d.name} ${d.value}%`}>
                  {holdingsData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {returnsData.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-3">📈 Price returns by period (%)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={returnsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {returnsData.map((d, i) => <Cell key={i} fill={d.value >= 0 ? "#16a34a" : "#dc2626"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {(ma50 || ma200 || raw.high_52w || raw.low_52w) && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-1">🎯 Technical reference levels</h2>
          <p className="text-xs text-gray-400 mb-3">
            Computed from moving averages and the 52-week range. Informational reference points only — not a buy/sell recommendation.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="negative-pill rounded-xl p-3 text-center">
              <p className="opacity-70 text-xs">52-week low</p>
              <p className="font-bold text-lg">₹{raw.low_52w?.toLocaleString() ?? "-"}</p>
            </div>
            <div className="bg-amber-50 text-amber-700 rounded-xl p-3 text-center">
              <p className="opacity-70 text-xs">~200-day avg</p>
              <p className="font-bold text-lg">₹{ma200 ? ma200.toFixed(2) : "-"}</p>
            </div>
            <div className="bg-sky-50 text-sky-700 rounded-xl p-3 text-center">
              <p className="opacity-70 text-xs">~50-day avg</p>
              <p className="font-bold text-lg">₹{ma50 ? ma50.toFixed(2) : "-"}</p>
            </div>
            <div className="positive-pill rounded-xl p-3 text-center">
              <p className="opacity-70 text-xs">52-week high</p>
              <p className="font-bold text-lg">₹{raw.high_52w?.toLocaleString() ?? "-"}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Zones near the 52-week low and 200-day average are sometimes watched as potential support; zones near the 50-day average and 52-week high as potential resistance. General technical context, not personalized advice.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400">
        This information is for informational purposes only and is not investment advice. Please consult a SEBI-registered advisor before making investment decisions.
      </p>
    </div>
  );
}
