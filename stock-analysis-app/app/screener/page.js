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
      <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
        Screener
      </h1>

      <div className="card p-5 mb-6">
        <div className="flex flex-wrap gap-5 items-end">
          <label className="text-sm text-gray-600">
            Min investment score
            <input
              type="number"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
              className="block border rounded-lg px-3 py-2 w-28 mt-1 focus:border-indigo-400 outline-none"
            />
          </label>
          <label className="text-sm text-gray-600">
            Min trading score
            <input
              type="number"
              value={minTrading}
              onChange={(e) => setMinTrading(e.target.value)}
              className="block border rounded-lg px-3 py-2 w-28 mt-1 focus:border-indigo-400 outline-none"
            />
          </label>
          <label className="text-sm text-gray-600">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="block border rounded-lg px-3 py-2 mt-1 focus:border-indigo-400 outline-none"
            >
              <option value="investment">Investment score</option>
              <option value="trading">Trading score</option>
            </select>
          </label>
          <button onClick={runScreen} className="btn-primary px-5 py-2 rounded-lg text-sm">
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center mt-10">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3">Symbol</th>
                <th className="p-3">Company</th>
                <th className="p-3">Investment</th>
                <th className="p-3">Trading</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => (
                <tr key={s.symbol} className="border-t hover:bg-indigo-50/40 transition">
                  <td className="p-3">
                    <a href={`/stock/${s.symbol}`} className="font-semibold text-indigo-700 hover:underline">
                      {s.symbol}
                    </a>
                  </td>
                  <td className="p-3 text-gray-600">{s.stocks?.company_name}</td>
                  <td className="p-3 font-medium">{s.investment_score}</td>
                  <td className="p-3 font-medium">{s.trading_score}</td>
                </tr>
              ))}
              {stocks.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-400">
                    No stocks match these filters yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
