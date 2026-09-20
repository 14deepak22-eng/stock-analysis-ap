"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { stockList } from "@/lib/stockList";

export default function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return stockList.filter((s) => s.symbol.startsWith(q)).slice(0, 6);
  }, [query]);

  function goTo(symbol) {
    setQuery("");
    setShowSuggestions(false);
    router.push(`/stock/${symbol}`);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    goTo(query.trim().toUpperCase());
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-48 md:w-64">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="🔍 Search stock..."
        className="w-full text-sm border border-gray-200 rounded-full px-4 py-1.5 focus:border-indigo-400 outline-none transition"
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg text-left z-30 overflow-hidden">
          {suggestions.map((s) => (
            <li
              key={s.symbol}
              onMouseDown={() => goTo(s.symbol)}
              className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
            >
              <span className="font-semibold text-indigo-700">{s.symbol}</span>
              <span className="text-gray-400"> — {s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
