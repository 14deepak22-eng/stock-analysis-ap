"use client";

import { useState, useEffect } from "react";

export default function Screener() {
  const [minInvestment, setMinInvestment] = useState(0);
  const [minTrading, setMinTrading] = useState(0);
  const [sort, setSort] = useState("investment");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);

  async function runScreen() {
    setLoading(true);
    const res = await fetch(
      `/api/screener?minInvestment=${minInvestment}&minTrading=${minTrading}&sort=${sort}`
    );
    const data = await res.json();
    setStocks(data.stocks || []);
    setLoading(false);
  }

  useEffect(() => {
    runScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-xl font-medium mb-4">Screener</h1>

      <div className="flex flex-wrap gap-4 items-end mb-6 bg-white border rounded-xl p-4">
        <label className="text-sm">
          Min investment score
          <input
            type="number"
            value={minInvestment}
            onChange={(e) => setMinInvestment(e.target.value)}
            className="block border rounded px-2 py-1 w-24 mt-1"
          />
        </label>
        <label className="text-sm">
          Min trading score
          <input
            type="number"
            value={minTrading}
            onChange={(e) => setMinTrading(e.target.value)}
            className="block border rounded px-2 py-1 w-24 mt-1"
          />
        </label>
        <label className="text-sm">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="block border rounded px-2 py-1 mt-1"
          >
            <option value="investment">Investment score</option>
            <option value="trading">Trading score</option>
          </select>
        </label>
        <button
          onClick={runScreen}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm"
        >
          Apply
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Symbol</th>
              <th className="p-3">Company</th>
              <th className="p-3">Investment score</th>
              <th className="p-3">Trading score</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
              <tr key={s.symbol} className="border-t">
                <td className="p-3">
                  <a href={`/stock/${s.symbol}`} className="underline">
                    {s.symbol}
                  </a>
                </td>
                <td className="p-3">{s.stocks?.company_name}</td>
                <td className="p-3">{s.investment_score}</td>
                <td className="p-3">{s.trading_score}</td>
              </tr>
            ))}
            {stocks.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-gray-400">
                  No stocks match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
