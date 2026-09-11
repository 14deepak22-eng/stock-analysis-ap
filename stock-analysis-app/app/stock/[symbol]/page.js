"use client";

import { useEffect, useState } from "react";
import StockView from "@/components/StockView";
import { getFullStockData } from "@/lib/dashboard";

export default function StockPage({ params }) {
  const symbol = params.symbol.toUpperCase();
  const [data, setData] = useState(undefined); // undefined = checking, null = need to fetch
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const local = getFullStockData(symbol);
    if (local) {
      // Found in the browser - render instantly, zero network calls.
      setData(local);
    } else {
      setData(null); // not cached locally - need to fetch
    }
  }, [symbol]);

  useEffect(() => {
    if (data === null) {
      setLoading(true);
      fetch(`/api/stock/${symbol}`)
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }
  }, [data, symbol]);

  if (data === undefined) {
    return null; // checking local storage, near-instant, avoid a flash
  }

  if (loading || data === null) {
    return (
      <div className="flex flex-col items-center justify-center mt-24 gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Fetching the latest data…</p>
      </div>
    );
  }

  if (data.error) {
    return <p className="text-red-600">Could not load data for {symbol}.</p>;
  }

  return <StockView symbol={symbol} initialData={data} />;
}
