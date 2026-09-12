"use client";

import { useState } from "react";
import { sectorNames, getStocksBySector } from "@/lib/stockList";

export default function Sectors() {
  const [selectedSector, setSelectedSector] = useState(null);

  const stocks = selectedSector ? getStocksBySector(selectedSector) : [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Browse by sector</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {sectorNames.map((sector) => (
          <button
            key={sector}
            onClick={() => setSelectedSector(sector)}
            className={"px-4 py-2 rounded-full text-sm font-medium border transition " + (selectedSector === sector ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300")}
          >
            {sector}
          </button>
        ))}
      </div>

      {selectedSector && (
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">
            {selectedSector} ({stocks.length} stocks)
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stocks.map((s) => (
              <a key={s.symbol} href={"/stock/" + s.symbol} className="border rounded-xl p-3 bg-white hover:border-indigo-300 hover:shadow-sm transition">
                <p className="font-semibold text-indigo-700">{s.symbol}</p>
                <p className="text-xs text-gray-500">{s.name}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {!selectedSector && (
        <p className="text-gray-400 text-sm">Pick a sector above to see its stocks.</p>
      )}
    </div>
  );
}
