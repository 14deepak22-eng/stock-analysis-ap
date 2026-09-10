// Shared technical-signal calculation, used by both the on-demand search
// route and the daily cron job, so the math only lives in one place.

export function buildTechnicalSignals(candleData) {
  const candles = candleData?.data ?? [];
  const closes = candles.map((c) => c[4]);
  const volumes = candles.map((c) => c[5]);

  const price = closes.at(-1);
  const ma50 = average(closes.slice(-50));
  const ma200 = average(closes.slice(-200));
  const rsi = computeRSI(closes.slice(-15));
  const { macdLine, macdSignal } = computeMACD(closes);
  const recentVolume = average(volumes.slice(-5));
  const avgVolume = average(volumes.slice(-30));
  const priceRising = closes.length > 6 ? closes.at(-1) > closes.at(-6) : null;

  return { price, ma50, ma200, rsi, macdLine, macdSignal, recentVolume, avgVolume, priceRising };
}

/**
 * Builds a trimmed daily price series with rolling 50/200-day averages,
 * for the price chart. Keeps only the last ~150 points so the payload
 * stays small.
 */
export function buildPriceHistory(candleData) {
  const candles = candleData?.data ?? [];
  const closes = candles.map((c) => c[4]);
  const dates = candles.map((c) => c[0]?.slice(0, 10));

  const series = closes.map((close, i) => {
    const ma50Slice = closes.slice(Math.max(0, i - 49), i + 1);
    const ma200Slice = closes.slice(Math.max(0, i - 199), i + 1);
    return {
      date: dates[i],
      close: Number(close?.toFixed(2)),
      ma50: ma50Slice.length >= 50 ? Number(average(ma50Slice).toFixed(2)) : null,
      ma200: ma200Slice.length >= 200 ? Number(average(ma200Slice).toFixed(2)) : null,
    };
  });

  return series.slice(-150);
}

function average(arr) {
  const clean = arr.filter((v) => typeof v === "number");
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function computeRSI(closes) {
  if (closes.length < 2) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / closes.length;
  const avgLoss = losses / closes.length;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes) {
  if (closes.length < 26) return { macdLine: null, macdSignal: null };
  const ema = (values) => {
    const k = 2 / (values.length + 1);
    let emaVal = values[0];
    for (let i = 1; i < values.length; i++) {
      emaVal = values[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  };
  const ema12 = ema(closes.slice(-26));
  const ema26 = ema(closes.slice(-26));
  const macdLine = ema12 - ema26;
  const macdSignal = macdLine * 0.9;
  return { macdLine, macdSignal };
}

export function formatForSmartApi(date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}
