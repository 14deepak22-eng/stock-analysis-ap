"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { stockList } from "@/lib/stockList";

export default function Home() {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return stockList
      .filter((s) => s.symbol.startsWith(q))
      .slice(0, 8);
  }, [query]);

  function goToStock(symbol) {
    setShowSuggestions(false);
    router.push(`/stock/${symbol}`);
  }

  function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    goToStock(query.trim().toUpperCase());
  }

  return (
    <div className="text-center mt-16">
      <h1 className="text-2xl font-medium mb-2">Search a stock</h1>
      <p className="text-gray-500 mb-6">
        e.g. RELIANCE, TCS, INFY - get an Investment score, a Trading score,
        and news sentiment, each explained in plain language.
      </p>
      <form onSubmit={handleSearch} className="flex flex-col items-center gap-2">
        <div className="relative w-64">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Enter a stock symbol"
            className="border rounded-lg px-4 py-2 w-full"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg text-left z-10 overflow-hidden">
              {suggestions.map((s) => (
                <li
                  key={s.symbol}
                  onClick={() => goToStock(s.symbol)}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                >
                  <span className="font-medium">{s.symbol}</span>
                  <span className="text-gray-400"> - {s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="bg-black text-white px-4 py-2 rounded-lg w-64">
          Search
        </button>
      </form>
    </div>
  );
}
