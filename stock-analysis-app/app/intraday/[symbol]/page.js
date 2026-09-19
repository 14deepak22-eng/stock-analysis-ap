"use client";

import { useState, useEffect } from "react";

export default function IntradayDetailPage({ params }) {
  const symbol = params.symbol.toUpperCase();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/intraday/stocks/${symbol}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [symbol]);

  if (loading) {
    return <div className="flex justify-center mt-16"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }

  if (!data?.success) {
    return <p className="text-center text-gray-400 mt-16">No data available for {symbol} yet.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{symbol}</h1>
      <p className="text-sm text-gray-500 mb-6">{data.companyName}</p>

      <div className="card p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold">₹{data.currentPrice?.toLocaleString()}</p>
          <p className="text-sm text-gray-500">{data.signal}</p>
        </div>
        <span className="score-badge-good text-white text-2xl font-bold w-16 h-16 rounded-full flex items-center justify-center shadow-lg">
          {data.score}
        </span>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Score breakdown</h2>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {Object.entries(data.componentScores || {}).map(([k, v]) => (
            <div key={k} className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-400 capitalize">{k}</p>
              <p className="font-bold text-gray-800">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Indicators</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {Object.entries(data.indicators || {}).map(([k, v]) => (
            <div key={k}>
              <p className="text-gray-400 text-xs capitalize">{k}</p>
              <p className="font-bold">{v ?? "-"}</p>
            </div>
          ))}
        </div>
      </div>

      {data.riskLevels?.entry && (
        <div className="grid grid-cols-3 gap-2 mb-6 text-center text-sm">
          <div className="negative-pill rounded-xl p-3"><p className="text-xs opacity-70">Stop-loss</p><p className="font-bold">₹{data.riskLevels.stopLoss}</p></div>
          <div className="bg-indigo-50 text-indigo-700 rounded-xl p-3"><p className="text-xs opacity-70">Entry</p><p className="font-bold">₹{data.riskLevels.entry}</p></div>
          <div className="positive-pill rounded-xl p-3"><p className="text-xs opacity-70">Target</p><p className="font-bold">₹{data.riskLevels.target}</p></div>
        </div>
      )}

      <p className="text-xs text-gray-400">{data.riskWarning}</p>
    </div>
  );
}
