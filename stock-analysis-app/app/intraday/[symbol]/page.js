"use client";

import CandlestickChart from "@/components/CandlestickChart";
import RsiPanel from "@/components/RsiPanel";
import IntervalSelector from "@/components/IntervalSelector";
import BackButton from "@/components/BackButton";
import PaperTradeWidget from "@/components/PaperTradeWidget";

export default function IntradayDetailPage({ params }) {
  const symbol = params.symbol.toUpperCase();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [candles, setCandles] = useState([]);
  const [interval, setIntervalKey] = useState("5min");
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [candlesError, setCandlesError] = useState(null);

  const [livePrice, setLivePrice] = useState(null);

  useEffect(() => {
    fetch("/api/intraday/stocks/" + symbol)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setData(d);
        setLoading(false);
      });
  }, [symbol]);

  // Live price polling - the score/indicators are only as fresh as the
  // last scan, but the price itself should stay close to real-time.
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/trading/live-prices?symbols=" + symbol);
        const d = await res.json();
        setLivePrice(d.prices ? d.prices[symbol] : null);
      } catch {
        // keep last known price on failure
      }
    }
    poll();
    const id = setInterval(poll, 12000);
    return () => clearInterval(id);
  }, [symbol]);

  const loadCandles = useCallback(function () {
    setLoadingCandles(true);
    setCandlesError(null);
    fetch("/api/trading/candles?symbol=" + symbol + "&interval=" + interval)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) {
          setCandlesError(d.error);
          setCandles([]);
        } else {
          setCandles(d.candles || []);
        }
        setLoadingCandles(false);
      })
      .catch(function (err) {
        setCandlesError(err.message);
        setLoadingCandles(false);
      });
  }, [symbol, interval]);

  useEffect(function () {
    loadCandles();
  }, [loadCandles]);

  if (loading) {
    return (
      <div className="flex justify-center mt-16">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !data.success) {
    return <p className="text-center text-gray-400 mt-16">No data available for {symbol} yet.</p>;
  }

  const indicatorList = [
    { key: "vwap", label: "VWAP", desc: "Volume-weighted average price today" },
    { key: "rsi", label: "RSI (14)", desc: ">70 overbought, <30 oversold" },
    { key: "ema9", label: "EMA 9", desc: "Fast moving average" },
    { key: "ema20", label: "EMA 20", desc: "Slower moving average" },
    { key: "atr", label: "ATR", desc: "Typical price movement range" },
    { key: "relativeVolume", label: "Relative Volume", desc: "vs. typical volume (1.0 = normal)" },
  ];

  const scoreBars = [
    { key: "momentum", label: "🚀 Momentum", max: 25 },
    { key: "volume", label: "📈 Volume", max: 25 },
    { key: "volatility", label: "⚡ Volatility", max: 20 },
    { key: "liquidity", label: "💧 Liquidity", max: 20 },
    { key: "marketAlignment", label: "🌐 Market alignment", max: 10 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{symbol}</h1>
      <p className="text-sm text-gray-500 mb-6">{data.companyName}</p>

      <div className="card p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-3xl font-bold flex items-center gap-2">
            ₹{(livePrice ?? data.currentPrice) != null ? (livePrice ?? data.currentPrice).toLocaleString() : "-"}
            {livePrice && <span className="text-xs text-green-600 animate-pulse font-normal">● live</span>}
          </p>
          <p className="text-sm text-gray-500">{data.signal}</p>
          <p className="text-xs text-gray-400 mt-1">
            Score based on scan from {data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : "unknown time"}
          </p>
        </div>
        <span className="score-badge-good text-white text-2xl font-bold w-16 h-16 rounded-full flex items-center justify-center shadow-lg">
          {data.score}
        </span>
      </div>

      {/* Candlestick chart */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">📈 Candlestick chart</h2>
          <IntervalSelector selected={interval} onChange={setIntervalKey} disabled={loadingCandles} />
        </div>
        {loadingCandles ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : candlesError ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-500 mb-3">Couldn't load chart data: {candlesError}</p>
            <button onClick={loadCandles} className="btn-primary px-4 py-2 rounded-lg text-sm">Try again</button>
          </div>
        ) : (
          <div>
            <CandlestickChart candles={candles} />
            <div className="mt-3 border-t pt-3">
              <RsiPanel candles={candles} />
            </div>
          </div>
        )}
      </div>

      {/* Score breakdown - animated horizontal bars */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">📊 Score breakdown</h2>
        <div className="space-y-4">
          {scoreBars.map(function (item) {
            const value = data.componentScores && data.componentScores[item.key] != null ? data.componentScores[item.key] : 0;
            const pct = Math.round((value / item.max) * 100);
            const barColor = pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span className="text-sm font-bold" style={{ color: barColor }}>
                    {value}<span className="text-gray-400 font-normal">/{item.max}</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: pct + "%", backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Indicators */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">🔍 Indicators</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {indicatorList.map(function (item) {
            const v = data.indicators ? data.indicators[item.key] : null;
            return (
              <div key={item.key} className="bg-gray-50 rounded-xl p-3">
                <p className="text-gray-700 text-xs font-semibold">{item.label}</p>
                <p className="font-bold text-lg">
                  {v != null ? v : <span className="text-gray-300 text-sm font-normal">Not enough data</span>}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk levels */}
      {data.riskLevels && data.riskLevels.entry != null && (
        <div className="grid grid-cols-3 gap-2 mb-6 text-center text-sm">
          <div className="negative-pill rounded-xl p-3"><p className="text-xs opacity-70">Stop-loss</p><p className="font-bold">₹{data.riskLevels.stopLoss}</p></div>
          <div className="bg-indigo-50 text-indigo-700 rounded-xl p-3"><p className="text-xs opacity-70">Entry</p><p className="font-bold">₹{data.riskLevels.entry}</p></div>
          <div className="positive-pill rounded-xl p-3"><p className="text-xs opacity-70">Target</p><p className="font-bold">₹{data.riskLevels.target}</p></div>
        </div>
      )}

      <div className="mb-6">
        <PaperTradeWidget symbol={symbol} livePrice={livePrice} />
      </div>

      <p className="text-xs text-gray-400">{data.riskWarning}</p>
    </div>
  );
}
