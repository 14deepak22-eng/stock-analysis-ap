"use client";

import { useEffect, useState } from "react";
import { getDashboardStocks, getStockSummary, removeFromDashboard } from "@/lib/dashboard";
import { getUserDashboardWithScores, removeFromUserDashboard, getCurrentUser } from "@/lib/userDashboard";

export default function Dashboard() {
  const [stocks, setStocks] = useState([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) {
        setLoggedIn(true);
        const userStocks = await getUserDashboardWithScores();
        setStocks(userStocks || []);
      } else {
        setLoggedIn(false);
        const symbols = getDashboardStocks();
        setStocks(symbols.map((symbol) => ({ symbol, ...getStockSummary(symbol) })));
      }
      setLoading(false);
    })();
  }, []);

  async function handleRemove(symbol) {
    if (loggedIn) {
      await removeFromUserDashboard(symbol);
    } else {
      removeFromDashboard(symbol);
    }
    setStocks((prev) => prev.filter((s) => s.symbol !== symbol));
  }

  if (loading) return null;

  if (stocks.length === 0) {
    return (
      <div className="text-center mt-16 text-gray-400">
        <p>No stocks yet. Search a stock and it'll show up here automatically.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Your dashboard</h1>
        {loggedIn && (
          <span className="text-xs text-gray-400">Synced to your account</span>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {stocks.map((s) => (
          <div key={s.symbol} className="border rounded-2xl p-4 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <a href={`/stock/${s.symbol}`} className="font-semibold text-indigo-700">{s.symbol}</a>
              <button onClick={() => handleRemove(s.symbol)} className="text-xs text-gray-400 hover:text-red-500">
                Remove
              </button>
            </div>
            <div className="flex gap-6 text-sm">
              <div><p className="text-gray-400">Overall</p><p className="font-bold text-lg">{s.overall_score ?? "-"}</p></div>
              <div><p className="text-gray-400">Investment</p><p className="font-bold text-lg">{s.investment_score ?? "-"}</p></div>
              <div><p className="text-gray-400">Trading</p><p className="font-bold text-lg">{s.trading_score ?? "-"}</p></div>
              <div><p className="text-gray-400">News</p><p className="font-bold text-sm mt-1">{s.news_sentiment ?? "-"}</p></div>
            </div>
            {s.score_date && <p className="text-xs text-gray-400 mt-2">as of {s.score_date}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
