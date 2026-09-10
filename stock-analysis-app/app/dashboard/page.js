"use client";

import { useEffect, useState } from "react";
import { getDashboardStocks, getStockSummary, removeFromDashboard } from "@/lib/dashboard";

export default function Dashboard() {
  const [stocks, setStocks] = useState([]);

  useEffect(() => {
    // Reads directly from localStorage - instant, no network calls,
    // no loading spinner needed.
    setStocks(getDashboardStocks());
  }, []);

  function handleRemove(symbol) {
    removeFromDashboard(symbol);
    setStocks((prev) => prev.filter((s) => s !== symbol));
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center mt-16 text-gray-400">
        <p>No stocks yet. Search a stock and it'll show up here automatically.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Your dashboard</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {stocks.map((symbol) => {
          const s = getStockSummary(symbol);
          return (
            <div key={symbol} className="border rounded-2xl p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <a href={`/stock/${symbol}`} className="font-semibold text-indigo-700">{symbol}</a>
                <button onClick={() => handleRemove(symbol)} className="text-xs text-gray-400 hover:text-red-500">
                  Remove
                </button>
              </div>
              <div className="flex gap-6 text-sm">
                <div><p className="text-gray-400">Overall</p><p className="font-bold text-lg">{s?.overall_score ?? "-"}</p></div>
                <div><p className="text-gray-400">Investment</p><p className="font-bold text-lg">{s?.investment_score ?? "-"}</p></div>
                <div><p className="text-gray-400">Trading</p><p className="font-bold text-lg">{s?.trading_score ?? "-"}</p></div>
                <div><p className="text-gray-400">News</p><p className="font-bold text-sm mt-1">{s?.news_sentiment ?? "-"}</p></div>
              </div>
              {s?.score_date && (
                <p className="text-xs text-gray-400 mt-2">as of {s.score_date}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
