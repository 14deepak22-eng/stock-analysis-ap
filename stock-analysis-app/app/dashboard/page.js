"use client";

import { useEffect, useState } from "react";
import { getDashboardStocks, removeFromDashboard } from "@/lib/dashboard";

export default function Dashboard() {
  const [stocks, setStocks] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const symbols = getDashboardStocks();
    setStocks(symbols);
    Promise.all(
      symbols.map((s) => fetch(`/api/stock/${s}`).then((r) => r.json()).then((d) => [s, d]))
    ).then((results) => {
      const map = {};
      results.forEach(([s, d]) => (map[s] = d));
      setScores(map);
      setLoading(false);
    });
  }, []);

  function handleRemove(symbol) {
    removeFromDashboard(symbol);
    setStocks((prev) => prev.filter((s) => s !== symbol));
  }

  if (stocks.length === 0 && !loading) {
    return <div className="text-center mt-16 text-gray-400"><p>No stocks yet. Search a stock and it'll show up here automatically.</p></div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Your dashboard</h1>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {stocks.map((symbol) => {
            const d = scores[symbol];
            return (
              <div key={symbol} className="border rounded-2xl p-4 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <a href={`/stock/${symbol}`} className="font-semibold text-indigo-700">{symbol}</a>
                  <button onClick={() => handleRemove(symbol)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                </div>
                <div className="flex gap-6 text-sm">
                  <div><p className="text-gray-400">Investment</p><p className="font-bold text-lg">{d?.score?.investment_score ?? "-"}</p></div>
                  <div><p className="text-gray-400">Trading</p><p className="font-bold text-lg">{d?.score?.trading_score ?? "-"}</p></div>
                  <div><p className="text-gray-400">News</p><p className="font-bold text-sm mt-1">{d?.analysis?.news_analysis?.sentiment ?? "-"}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
