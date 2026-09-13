"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function PaperTradeWidget({ symbol, livePrice }) {
  const [user, setUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [entryPrice, setEntryPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadTrades(data.session.user.id);
      else setLoading(false);
    });
  }, [symbol]);

  async function loadTrades(userId) {
    const { data } = await supabase
      .from("paper_trades")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .order("entry_date", { ascending: false });
    setTrades(data || []);
    setLoading(false);
  }

  async function handleAddTrade() {
    const price = parseFloat(entryPrice);
    if (!price || price <= 0 || !user) return;
    setSaving(true);
    const { error } = await supabase.from("paper_trades").insert({
      user_id: user.id,
      symbol,
      entry_price: price,
    });
    if (!error) {
      setEntryPrice("");
      await loadTrades(user.id);
    }
    setSaving(false);
  }

  async function handleClose(tradeId) {
    if (!user || !livePrice) return;
    await supabase
      .from("paper_trades")
      .update({ closed: true, closed_price: livePrice, closed_date: new Date().toISOString() })
      .eq("id", tradeId);
    await loadTrades(user.id);
  }

  async function handleDelete(tradeId) {
    if (!user) return;
    await supabase.from("paper_trades").delete().eq("id", tradeId);
    await loadTrades(user.id);
  }

  if (!user) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-gray-800 mb-2">📝 Paper trading</h2>
        <p className="text-sm text-gray-400">Log in to track hypothetical trades on this stock.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-800 mb-3">📝 Paper trading</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="number"
          step="0.01"
          value={entryPrice}
          onChange={(e) => setEntryPrice(e.target.value)}
          placeholder={livePrice ? `e.g. ${livePrice}` : "Entry price"}
          className="border rounded-lg px-3 py-2 text-sm flex-1 focus:border-indigo-400 outline-none"
        />
        <button
          onClick={handleAddTrade}
          disabled={saving || !entryPrice}
          className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Set entry"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="text-xs text-gray-400">No paper trades yet for {symbol}.</p>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => {
            const currentPrice = t.closed ? t.closed_price : livePrice;
            const returnPct = currentPrice
              ? (((currentPrice - t.entry_price) / t.entry_price) * 100).toFixed(2)
              : null;
            const isPositive = returnPct != null && returnPct >= 0;

            return (
              <div key={t.id} className="border rounded-xl p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="text-gray-500 text-xs">
                    Entry ₹{t.entry_price} · {new Date(t.entry_date).toLocaleDateString()}
                    {t.closed && " · closed"}
                  </p>
                  {returnPct != null && (
                    <p className={`font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                      {isPositive ? "▲" : "▼"} {Math.abs(returnPct)}%
                      <span className="text-gray-400 font-normal"> (₹{currentPrice})</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!t.closed && (
                    <button
                      onClick={() => handleClose(t.id)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Close
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Hypothetical only — no real money or orders involved. For tracking how well the signals perform.
      </p>
    </div>
  );
}
