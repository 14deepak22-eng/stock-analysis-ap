"use client";

import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { addToDashboard } from "@/lib/dashboard";

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

function ScoreBadge({ title, score, analysis, accent }) {
  return (
    <div className={`border rounded-2xl p-5 bg-white shadow-sm border-t-4 ${accent}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <span className="text-3xl font-bold">{score ?? "-"}</span>
      </div>
      {analysis ? (
        <>
          <p className="text-sm text-gray-700 mb-3">{analysis.summary}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-green-700 mb-1">Strengths</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                {(analysis.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-medium text-amber-700 mb-1">Concerns</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                {(analysis.concerns || []).map((c, i) => <li key={i}>{c}</li>)}
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
  }, [symbol]);

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

  // BharatStock's "public_holding" field appears to overlap with FII/DII
  // rather than being a clean remainder, which made the pie total over
  // 100%. Instead, we derive "Other" ourselves as whatever's left after
  // Promoter + FII + DII, guaranteeing the pie always sums to ~100%.
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

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{symbol}</h1>
          {score?.overall_score != null && (
            <span className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-sky-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
              Overall {score.overall_score}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {refreshing && <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />}
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Data as of {score?.score_date ?? "unknown"} · {data.cached ? "saved data — click Refresh for the latest" : "just fetched"} — not investment advice.
      </p>

      <div className="grid gap-4 mb-6">
        <ScoreBadge title="Investment score" score={score?.investment_score} analysis={analysis?.investment_analysis} accent="border-indigo-500" />
        <ScoreBadge title="Trading score" score={score?.trading_score} analysis={analysis?.trading_analysis} accent="border-sky-500" />
        <div className="border rounded-2xl p-5 bg-white shadow-sm border-t-4 border-amber-500">
          <h2 className="font-semibold text-gray-800 mb-2">News sentiment</h2>
          <p className="text-sm">
            <span className={`font-semibold ${
              analysis?.news_analysis?.sentiment === "Positive" ? "text-green-600" :
              analysis?.news_analysis?.sentiment === "Negative" ? "text-red-600" : "text-gray-500"
            }`}>
              {analysis?.news_analysis?.sentiment ?? "Unknown"}
            </span>
            {" - "}{analysis?.news_analysis?.reasoning}
          </p>
        </div>
      </div>

      <div className="border rounded-2xl p-5 bg-white shadow-sm mb-6">
        <h2 className="font-semibold text-gray-800 mb-1">Key ratios vs. general benchmarks</h2>
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
                <tr key={b.key} className="border-b last:border-0">
                  <td className="py-2 text-gray-700">{b.label}</td>
                  <td className="py-2 font-medium">{value != null ? value.toLocaleString() : "-"}</td>
                  <td className="py-2 text-gray-500">{b.acceptable}</td>
                  <td className="py-2">
                    {value == null ? <span className="text-gray-300">-</span> : good ? <span className="text-green-600">✓ Good</span> : <span className="text-amber-600">⚠ Watch</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {holdingsData.length > 0 && (
          <div className="border rounded-2xl p-5 bg-white shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-3">Shareholding pattern</h2>
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
          <div className="border rounded-2xl p-5 bg-white shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-3">Price returns by period (%)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={returnsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value">
                  {returnsData.map((d, i) => <Cell key={i} fill={d.value >= 0 ? "#16a34a" : "#dc2626"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {(ma50 || ma200 || raw.high_52w || raw.low_52w) && (
        <div className="border rounded-2xl p-5 bg-white shadow-sm mb-6">
          <h2 className="font-semibold text-gray-800 mb-1">Technical reference levels</h2>
          <p className="text-xs text-gray-400 mb-3">
            Computed from moving averages and the 52-week range. Informational reference points only — not a buy/sell recommendation.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-400">52-week low</p><p className="font-semibold">₹{raw.low_52w?.toLocaleString() ?? "-"}</p></div>
            <div><p className="text-gray-400">~200-day average</p><p className="font-semibold">₹{ma200 ? ma200.toFixed(2) : "-"}</p></div>
            <div><p className="text-gray-400">~50-day average</p><p className="font-semibold">₹{ma50 ? ma50.toFixed(2) : "-"}</p></div>
            <div><p className="text-gray-400">52-week high</p><p className="font-semibold">₹{raw.high_52w?.toLocaleString() ?? "-"}</p></div>
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
