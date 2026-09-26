"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export default function PaperTradesPage() {
  const [trades, setTrades] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const loadTrades = useCallback(async (userId) => {
    const { data } = await supabase
      .from("paper_trades")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });
    setTrades(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ?? null);
      if (u) loadTrades(u.id);
      else setLoading(false);
    });
  }, [loadTrades]);

  // Poll live prices for every unique open symbol, in one batched call
  useEffect(() => {
    const openSymbols = [...new Set(trades.filter((t) => !t.closed).map((t) => t.symbol))];
    if (openSymbols.length === 0) return;

    async function poll() {
      try {
        const res = await fetch("/api/trading/live-prices?symbols=" + openSymbols.join(","));
        const data = await res.json();
        setLivePrices(data.prices || {});
      } catch {
        // keep last known prices on failure
      }
    }
    poll();
    const id = setInterval(poll, 12000);
    return () => clearInterval(id);
  }, [trades]);

  async function handleClose(trade) {
    const currentPrice = livePrices[trade.symbol];
    if (!currentPrice) return;
    await supabase
      .from("paper_trades")
      .update({ closed: true, closed_price: currentPrice, closed_date: new Date().toISOString() })
      .eq("id", trade.id);
    await loadTrades(user.id);
  }

  async function handleDelete(tradeId) {
    await supabase.from("paper_trades").delete().eq("id", tradeId);
    await loadTrades(user.id);
  }

  if (loading) {
    return (
      <div className="flex justify-center mt-16">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-gray-400 mt-16">Log in to see your paper trades.</p>;
  }

  const openTrades = trades.filter((t) => !t.closed);
  const closedTrades = trades.filter((t) => t.closed);

  const totalOpenReturn = openTrades.reduce((sum, t) => {
    const price = livePrices[t.symbol];
    if (!price) return sum;
    return sum + ((price - t.entry_price) / t.entry_price) * 100;
  }, 0);
  const avgOpenReturn = openTrades.length > 0 ? (totalOpenReturn / openTrades.length).toFixed(2) : null;

  function TradeRow({ t, isClosed }) {
    const currentPrice = isClosed ? t.closed_price : livePrices[t.symbol];
    const returnPct = currentPrice != null
      ? (((currentPrice - t.entry_price) / t.entry_price) * 100).toFixed(2)
      : null;
    const isPositive = returnPct != null && returnPct >= 0;

    return (
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <a href={t.symbol} className="font-bold text-indigo-700 text-lg hover:underline">{t.symbol}</a>
          <p className="text-xs text-gray-400">
            Entry ₹{t.entry_price} on {new Date(t.entry_date).toLocaleDateString()}
            {isClosed && " · closed " + new Date(t.closed_date).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{isClosed ? "Closed at" : "Current"}: ₹{currentPrice ?? "-"}</p>
          {returnPct != null && (
            <p className={"font-bold text-lg " + (isPositive ? "text-green-600" : "text-red-600")}>
              {isPositive ? "▲" : "▼"} {Math.abs(returnPct)}%
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!isClosed && (
            <button onClick={() => handleClose(t)} className="text-xs text-indigo-600 hover:underline">Close</button>
          )}
          <button onClick={() => handleDelete(t.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
        📝 Paper Trading
      </h1>
      <p className="text-sm text-gray-500 mb-6">Track how well your signals perform, with hypothetical entries - no real money involved.</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-3 text-center"><p className="text-xs text-gray-400">Open trades</p><p className="font-bold text-lg">{openTrades.length}</p></div>
        <div className="card p-3 text-center"><p className="text-xs text-gray-400">Closed trades</p><p className="font-bold text-lg">{closedTrades.length}</p></div>
        <div className="card p-3 text-center">
          <p className="text-xs text-gray-400">Avg open return</p>
          <p className={"font-bold text-lg " + (avgOpenReturn >= 0 ? "text-green-600" : "text-red-600")}>
            {avgOpenReturn != null ? avgOpenReturn + "%" : "-"}
          </p>
        </div>
      </div>

      <h2 className="font-semibold text-gray-800 mb-3">Open ({openTrades.length})</h2>
      <div className="space-y-3 mb-8">
        {openTrades.length === 0 ? (
          <p className="text-sm text-gray-400">No open paper trades yet. Set an entry price from any stock's page.</p>
        ) : (
          openTrades.map((t) => <TradeRow key={t.id} t={t} isClosed={false} />)
        )}
      </div>

      <h2 className="font-semibold text-gray-800 mb-3">Closed ({closedTrades.length})</h2>
      <div className="space-y-3">
        {closedTrades.length === 0 ? (
          <p className="text-sm text-gray-400">No closed trades yet.</p>
        ) : (
          closedTrades.map((t) => <TradeRow key={t.id} t={t} isClosed={true} />)
        )}
      </div>

      <p className="text-xs text-gray-400 mt-8">
        Hypothetical only — no real money or orders involved. For tracking how well the signals perform.
      </p>
    </div>
  );
}
