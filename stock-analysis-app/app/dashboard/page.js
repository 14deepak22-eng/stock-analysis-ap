"use client";

import { useEffect, useState } from "react";
import { getDashboardStocks, getStockSummary, removeFromDashboard } from "@/lib/dashboard";
import { getUserDashboardWithScores, removeFromUserDashboard, getCurrentUser } from "@/lib/userDashboard";

function ScorePill({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-bold text-lg text-gray-800">{value ?? "-"}</p>
    </div>
  );
}

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

  if (loading) {
    return (
      <div className="flex justify-center mt-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center mt-20 text-gray-400">
        <div className="text-5xl mb-4">📊</div>
        <p>No stocks yet. Search a stock and it'll show up here automatically.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Your dashboard
        </h1>
        {loggedIn && (
          <span className="text-xs text-gray-400 bg-indigo-50 px-3 py-1 rounded-full">
            🔒 Synced to your account
          </span>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {stocks.map((s) => (
          <div key={s.symbol} className="card card-hover p-5">
            <div className="flex items-center justify-between mb-3">
              <a href={`/stock/${s.symbol}`} className="font-bold text-indigo-700 text-lg hover:underline">
                {s.symbol}
              </a>
              <button
                onClick={() => handleRemove(s.symbol)}
                className="text-xs text-gray-400 hover:text-red-500 transition"
              >
                Remove
              </button>
            </div>
            <div className="flex justify-around bg-gray-50 rounded-xl py-3">
              <ScorePill label="Overall" value={s.overall_score} />
              <ScorePill label="Investment" value={s.investment_score} />
              <ScorePill label="Trading" value={s.trading_score} />
              <ScorePill label="News" value={s.news_sentiment} />
            </div>
            {s.score_date && (
              <p className="text-xs text-gray-400 mt-3 text-center">as of {s.score_date}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
