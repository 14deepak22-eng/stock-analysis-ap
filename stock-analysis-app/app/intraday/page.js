"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function signalColor(signal) {
  if (signal === "Strong Bullish Candidate") return "score-badge-good";
  if (signal === "Bullish Candidate") return "score-badge-good";
  if (signal === "Neutral / Watchlist") return "score-badge-mid";
  if (signal === "Weak") return "score-badge-mid";
  return "score-badge-bad";
}

export default function IntradayPage() {
  const [status, setStatus] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [minScore, setMinScore] = useState(0);
  const [signalFilter, setSignalFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");

  const pollRef = useRef(null);

  const loadStocks = useCallback(async () => {
    const params = new URLSearchParams({ minScore: String(minScore), limit: String(limit) });
    if (signalFilter) params.set("signal", signalFilter);
    if (search) params.set("search", search);
    const res = await fetch("/api/intraday/stocks?" + params.toString());
    const data = await res.json();
    setStocks(data.stocks || []);
    setMeta(data);
    setLoading(false);
  }, [minScore, signalFilter, limit, search]);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/intraday/status");
    const data = await res.json();
    setStatus(data);
    return data;
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const res = await fetch("/api/intraday/fetch-data", { method: "POST" });
    const data = await res.json();

    if (data.isFresh) {
      await loadStocks();
      setRefreshing(false);
      return;
    }

    pollRef.current = setInterval(async () => {
      const s = await loadStatus();
      if (!s.processing) {
        clearInterval(pollRef.current);
        await loadStocks();
        setRefreshing(false);
      }
    }, 4000);
  }

  useEffect(() => {
    (async () => {
      const s = await loadStatus();
      if (s.isFresh) {
        await loadStocks();
      } else if (!s.processing) {
        await handleRefresh();
      } else {
        setRefreshing(true);
        pollRef.current = setInterval(async () => {
          const st = await loadStatus();
          if (!st.processing) {
            clearInterval(pollRef.current);
            await loadStocks();
            setRefreshing(false);
          }
        }, 4000);
      }
      setLoading(false);
    })();
    return function cleanup() {
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && !refreshing) loadStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScore, signalFilter, limit, search]);

  const highestScore = stocks[0] ? stocks[0].score : "-";
  const bullishCount = stocks.filter(function (s) {
    return s.signal && s.signal.indexOf("Bullish") !== -1;
  }).length;

  const summaryCards = [
    { label: "Scanned", value: meta.totalStocksScanned != null ? meta.totalStocksScanned : "-" },
    { label: "Shortlisted", value: meta.shortlistedStocks != null ? meta.shortlistedStocks : "-" },
    { label: "Highest score", value: highestScore },
    { label: "Bullish", value: bullishCount },
    { label: "Market", value: status && status.marketOpen ? "Open" : "Closed" },
    { label: "Updated", value: meta.lastUpdated ? new Date(meta.lastUpdated).toLocaleTimeString() : "-" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
          ⚡ Intraday Trading
        </h1>
        <p className="text-sm text-gray-500 mt-1">AI-powered technical stock rankings for intraday trading.</p>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className={"px-3 py-1 rounded-full font-medium " + (status && status.marketOpen ? "positive-pill" : "neutral-pill")}>
            {status && status.marketOpen ? "🟢 Market Open" : "⚪ Market Closed"}
          </span>
          <span className="text-gray-500">
            Last refresh: {meta.lastUpdated ? new Date(meta.lastUpdated).toLocaleTimeString() : "never"}
          </span>
          {refreshing && (
            <span className="text-indigo-600 flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />
              Updating rankings…
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "🔄 Refresh Rankings"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {summaryCards.map(function (card) {
          return (
            <div key={card.label} className="card p-3 text-center">
              <p className="text-xs text-gray-400">{card.label}</p>
              <p className="font-bold text-gray-800">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm text-gray-600">
          Min score
          <input type="number" value={minScore} onChange={function (e) { setMinScore(Number(e.target.value)); }} className="block border rounded-lg px-3 py-2 w-24 mt-1" />
        </label>
        <label className="text-sm text-gray-600">
          Signal
          <select value={signalFilter} onChange={function (e) { setSignalFilter(e.target.value); }} className="block border rounded-lg px-3 py-2 mt-1">
            <option value="">All</option>
            <option value="bullish">Bullish</option>
            <option value="neutral">Neutral</option>
            <option value="bearish">Avoid/Low</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Show
          <select value={limit} onChange={function (e) { setLimit(Number(e.target.value)); }} className="block border rounded-lg px-3 py-2 mt-1">
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
          </select>
        </label>
        <label className="text-sm text-gray-600 flex-1" style={{ minWidth: "150px" }}>
          Search symbol
          <input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="e.g. TCS" className="block border rounded-lg px-3 py-2 mt-1 w-full" />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center mt-16">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : stocks.length === 0 ? (
        <p className="text-center text-gray-400 mt-16">No stocks match these filters yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Symbol</th>
                <th className="p-3">Price</th>
                <th className="p-3">Change</th>
                <th className="p-3">Score</th>
                <th className="p-3">Signal</th>
                <th className="p-3">Volume</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map(function (s) {
                return (
                  <tr key={s.symbol} className="border-t hover:bg-indigo-50/40 transition">
                    <td className="p-3 text-gray-400">{s.rank}</td>
                    <td className="p-3">
                      <a href={"/intraday/" + s.symbol} className="font-semibold text-indigo-700 hover:underline">
                        {s.symbol}
                      </a>
                    </td>
                    <td className="p-3 font-medium">₹{s.currentPrice != null ? s.currentPrice.toLocaleString() : "-"}</td>
                    <td className={"p-3 font-medium " + (s.priceChangePercentage >= 0 ? "text-green-600" : "text-red-600")}>
                      {s.priceChangePercentage != null ? (s.priceChangePercentage >= 0 ? "▲ " : "▼ ") + Math.abs(s.priceChangePercentage) + "%" : "-"}
                    </td>
                    <td className="p-3">
                      <span className={signalColor(s.signal) + " text-white px-2.5 py-1 rounded-full text-xs font-bold"}>{s.score}</span>
                    </td>
                    <td className="p-3 text-xs text-gray-600">{s.signal}</td>
                    <td className="p-3 text-xs text-gray-500">{s.volumeStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        These rankings are algorithmic technical-analysis scores for informational purposes only. They are not guaranteed predictions or financial advice. Always verify market conditions and manage risk independently.
      </p>
    </div>
  );
}
