"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/stock/${query.trim().toUpperCase()}`);
  }

  return (
    <div className="text-center mt-16">
      <h1 className="text-2xl font-medium mb-2">Search a stock</h1>
      <p className="text-gray-500 mb-6">
        e.g. RELIANCE, TCS, INFY - get an Investment score, a Trading score,
        and news sentiment, each explained in plain language.
      </p>
      <form onSubmit={handleSearch} className="flex gap-2 justify-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a stock symbol"
          className="border rounded-lg px-4 py-2 w-64"
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded-lg">
          Search
        </button>
      </form>
    </div>
  );
}
