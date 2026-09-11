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
    return stockList.filter((s) => s.symbol.startsWith(q)).slice(0, 8);
  }, [query]);

  function selectSuggestion(symbol) {
    setQuery(symbol);
    setShowSuggestions(false);
  }

  const [submitting, setSubmitting] = useState(false);

  function handleSearch(e) {
    e.preventDefault();
    if (!query.trim() || submitting) return;
    setSubmitting(true);
    router.push(`/stock/${query.trim().toUpperCase()}`);
  }

  return (
    <div className="text-center mt-16">
      <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
        Search a stock
      </h1>
      <p className="text-gray-500 mb-6">
        e.g. RELIANCE, TCS, INFY — Investment score, Trading score, and news
        sentiment, explained in plain language.
      </p>
      <form onSubmit={handleSearch} className="flex flex-col items-center gap-3">
        <div className="relative w-72">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Enter a stock symbol"
            className="border-2 border-indigo-100 focus:border-indigo-400 outline-none rounded-xl px-4 py-3 w-full shadow-sm"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg text-left z-10 overflow-hidden">
              {suggestions.map((s) => (
                <li
                  key={s.symbol}
                  onMouseDown={() => selectSuggestion(s.symbol)}
                  className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                >
                  <span className="font-semibold text-indigo-700">{s.symbol}</span>
                  <span className="text-gray-400"> — {s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 hover:bg-indigo-700 transition text-white px-6 py-3 rounded-xl w-72 font-medium shadow-sm disabled:opacity-50"
        >
          {submitting ? "Searching…" : "Search"}
        </button>
      </form>
    </div>
  );
}
