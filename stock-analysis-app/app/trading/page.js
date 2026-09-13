"use client";

import { useEffect, useState } from "react";
import TradingSignalCard from "@/components/TradingSignalCard";

export default function TradingPage() {
  const [picks, setPicks] = useState([]);
  const [isToday, setIsToday] = useState(true);
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState({});
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  useEffect(() => {
    fetch("/api/trading")
      .then((r) => r.json())
      .then((data) => {
        setPicks(data.picks || []);
        setIsToday(data.isToday);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (picks.length === 0) return;

    const symbols = picks.map((p) => p.symbol).join(",");

    async function pollPrices() {
      try {
        const res = await fetch(`/api/trading/live-prices?symbols=${symbols}`);
        const data = await res.json();
        setLivePrices(data.prices || {});
      } catch {
        // silently ignore - keep showing last known prices
      }
    }

    pollPrices();
    const interval = setInterval(pollPrices, 12000); // every 12 seconds
    return () => clearInterval(interval);
  }, [picks]);

  async function loadPicks() {
    setLoading(true);
    const res = await fetch("/api/trading");
    const data = await res.json();
    setPicks(data.picks || []);
    setIsToday(data.isToday);
    setLoading(false);
  }

  async function handleManualScan() {
    setScanning(true);
    setScanMessage("Scanning 200 stocks - this takes 1-2 minutes, please wait...");
    try {
      const res = await fetch("/api/trading/scan-now", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setScanMessage("Scan failed: " + data.error);
      } else {
        setScanMessage(`Done - scanned ${data.scanned} stocks, found ${data.topPicks?.length ?? 0} top picks.`);
        await loadPicks();
      }
    } catch (err) {
      setScanMessage("Scan failed: " + err.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center mt-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
            🎯 Today's Top Trading Signals
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranked from a scan of 200 stocks by technical setup, historical backtest, and risk-reward.
            {!isToday && " Showing the most recent available scan."}
          </p>
        </div>
        <button
          onClick={handleManualScan}
          disabled={scanning}
          className="text-sm border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 px-4 py-2 rounded-xl disabled:opacity-50 flex items-center gap-2 transition whitespace-nowrap"
        >
          {scanning && <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />}
          {scanning ? "Scanning…" : "🔄 Fetch new list"}
        </button>
      </div>

      {scanMessage && (
        <div className="bg-indigo-50 text-indigo-700 text-sm rounded-xl p-3 mb-6">
          {scanMessage}
        </div>
      )}

      {picks.length === 0 ? (
        <p className="text-gray-400 text-center mt-16">No scan results yet. Check back after the next daily scan.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {picks.map((pick) => (
            <TradingSignalCard key={pick.symbol} pick={pick} livePrice={livePrices[pick.symbol]} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-8 text-center">
        This information is for informational purposes only and is not investment advice. Entry, stop-loss, and target levels are calculated reference points, not guarantees. Please consult a SEBI-registered advisor before making investment decisions.
      </p>
    </div>
  );
}
