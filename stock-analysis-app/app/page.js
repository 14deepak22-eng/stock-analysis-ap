"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { stockList, sectorNames, sectorIcons, getStocksBySector } from "@/lib/stockList";

export default function Home() {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSector, setSelectedSector] = useState(null);
  const router = useRouter();

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return stockList.filter((s) => s.symbol.startsWith(q)).slice(0, 8);
  }, [query]);

  const sectorStocks = selectedSector ? getStocksBySector(selectedSector) : [];

  function selectSuggestion(symbol) {
    setQuery(symbol);
    setShowSuggestions(false);
  }

  function handleSearch(e) {
    e.preventDefault();
    if (!query.trim() || submitting) return;
    setSubmitting(true);
    router.push("/stock/" + query.trim().toUpperCase());
  }

  function toggleSector(sector) {
    setSelectedSector(function (prev) {
      return prev === sector ? null : sector;
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mt-8 mb-10">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Search a stock
        </h1>
        <p className="text-gray-500 mb-6">
          e.g. RELIANCE, TCS, INFY — Investment score, Trading score, and news sentiment, explained in plain language.
        </p>
        <form onSubmit={handleSearch} className="flex flex-col items-center gap-3">
          <div className="relative w-72">
            <input
              value={query}
              onChange={function (e) {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={function () { setShowSuggestions(true); }}
              onBlur={function () { setTimeout(function () { setShowSuggestions(false); }, 150); }}
              placeholder="Enter a stock symbol"
              className="border-2 border-indigo-100 focus:border-indigo-400 outline-none rounded-xl px-4 py-3 w-full shadow-sm"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg text-left z-10 overflow-hidden">
                {suggestions.map(function (s) {
                  return (
                    <li
                      key={s.symbol}
                      onMouseDown={function () { selectSuggestion(s.symbol); }}
                      className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                    >
                      <span className="font-semibold text-indigo-700">{s.symbol}</span>
                      <span className="text-gray-400"> — {s.name}</span>
                    </li>
                  );
                })}
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

      <div className="border-t pt-8">
        <p className="text-center text-sm text-gray-400 mb-5">or browse by sector</p>

        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {sectorNames.map(function (sector) {
            const isSelected = selectedSector === sector;
            const pillClass =
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-150 " +
              (isSelected
                ? "bg-gradient-to-r from-indigo-600 to-sky-500 text-white border-transparent shadow-md scale-105"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:shadow-sm hover:-translate-y-0.5");
            return (
              <button key={sector} onClick={function () { toggleSector(sector); }} className={pillClass}>
                <span>{sectorIcons[sector] || "📈"}</span>
                {sector}
              </button>
            );
          })}
        </div>

        {selectedSector && (
          <div>
            <p className="text-sm text-gray-500 mb-3 text-center">
              {sectorStocks.length} stocks in <span className="font-semibold text-indigo-700">{selectedSector}</span>
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {sectorStocks.map(function (s) {
                return (
                  <a key={s.symbol} href={"/stock/" + s.symbol} className="border rounded-xl p-3 bg-white hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
                    <p className="font-semibold text-indigo-700">{s.symbol}</p>
                    <p className="text-xs text-gray-500">{s.name}</p>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
