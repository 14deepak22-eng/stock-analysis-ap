// Shared technical-signal calculation, used by the on-demand search route,
// the daily refresh cron, the trading scan and the backtest, so the math
// only lives in one place.
//
// Everything in here is pure (no network, no database) so it can be unit
// tested - see tests/technicals.test.mjs.

// How many calendar days of daily candles to request. A 200-day moving
// average needs 200 *trading* sessions, and there are only ~250 trading
// sessions in a calendar year (~0.7 per calendar day), so 400 calendar days
// (~280 sessions) leaves a comfortable margin for holidays. The old value of
// 220 only produced ~150 sessions, so the "200-day" average was never real.
export const DAILY_LOOKBACK_DAYS = 400;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function average(arr) {
  const clean = (arr ?? []).filter(isNum);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Exponential moving average series. The first value (at index period-1)
 * is the simple average of the first `period` values - the standard seed -
 * and every value before it is null.
 */
export function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Wilder's RSI over the whole series (the standard definition used by
 * charting platforms): the first average gain/loss is a plain average of the
 * first `period` changes, then each later value is smoothed
 * (prev * (period - 1) + current) / period. Values before index `period`
 * are null.
 */
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Latest RSI value, or null if there isn't enough history. */
export function computeRSI(closes, period = 14) {
  const series = rsiSeries(closes, period);
  return series.length ? series[series.length - 1] : null;
}

/**
 * Standard MACD: 12-period EMA minus 26-period EMA, with a 9-period EMA of
 * that line as the signal line. Needs at least 26 + 9 - 1 = 34 closes.
 *
 * (The earlier version computed both EMAs over the same 26 closes with the
 * same period, so the MACD line was always exactly 0.)
 */
export function computeMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const none = { macdLine: null, macdSignal: null, macdHistogram: null };
  if (closes.length < slow + signalPeriod - 1) return none;

  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const macdValues = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] != null && slowEma[i] != null) macdValues.push(fastEma[i] - slowEma[i]);
  }
  const signalValues = emaSeries(macdValues, signalPeriod);
  const macdLine = macdValues.at(-1);
  const macdSignal = signalValues.at(-1);
  if (macdLine == null || macdSignal == null) return none;
  return { macdLine, macdSignal, macdHistogram: macdLine - macdSignal };
}

export function buildTechnicalSignals(candleData) {
  // Each candle is [timestamp, open, high, low, close, volume]. Drop rows
  // with a missing close so closes and volumes stay aligned.
  const rows = (candleData?.data ?? []).filter((c) => isNum(c?.[4]));
  const closes = rows.map((c) => c[4]);
  const volumes = rows.map((c) => c[5]);

  const price = closes.at(-1) ?? null;
  // A moving average is only reported once there is enough history for it
  // to mean what its name says; otherwise null (the scorer then skips it
  // instead of pretending it knows).
  const ma50 = closes.length >= 50 ? average(closes.slice(-50)) : null;
  const ma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const rsi = computeRSI(closes);
  const { macdLine, macdSignal, macdHistogram } = computeMACD(closes);
  const recentVolume = average(volumes.slice(-5));
  const avgVolume = average(volumes.slice(-30));
  const priceRising = closes.length > 5 ? closes.at(-1) > closes.at(-6) : null;

  return {
    price,
    ma50,
    ma200,
    rsi,
    macdLine,
    macdSignal,
    macdHistogram,
    recentVolume,
    avgVolume,
    priceRising,
    candleCount: closes.length,
  };
}

export function buildPriceHistory(candleData) {
  const rows = (candleData?.data ?? []).filter((c) => isNum(c?.[4]));
  const closes = rows.map((c) => c[4]);
  const dates = rows.map((c) => c[0]?.slice(0, 10));

  const series = closes.map((close, i) => {
    const ma50Slice = closes.slice(Math.max(0, i - 49), i + 1);
    const ma200Slice = closes.slice(Math.max(0, i - 199), i + 1);
    return {
      date: dates[i],
      close: Number(close.toFixed(2)),
      ma50: ma50Slice.length >= 50 ? Number(average(ma50Slice).toFixed(2)) : null,
      ma200: ma200Slice.length >= 200 ? Number(average(ma200Slice).toFixed(2)) : null,
    };
  });

  return series.slice(-150);
}

export function formatForSmartApi(date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

// Maps a friendly interval name to Angel One's required parameter and a
// sensible default lookback window - shorter intervals need much shorter
// windows, since 1-minute data over months would be enormous.
export const INTERVAL_OPTIONS = {
  "1min": { apiValue: "ONE_MINUTE", lookbackDays: 5, label: "1 min" },
  "5min": { apiValue: "FIVE_MINUTE", lookbackDays: 15, label: "5 min" },
  "15min": { apiValue: "FIFTEEN_MINUTE", lookbackDays: 30, label: "15 min" },
  "1hr": { apiValue: "ONE_HOUR", lookbackDays: 90, label: "1 hour" },
  "1day": { apiValue: "ONE_DAY", lookbackDays: 365, label: "1 day" },
};

/**
 * Converts raw SmartAPI candle rows into the {date, open, high, low,
 * close, volume} shape the candlestick chart component expects.
 */
export function formatCandlesForChart(candleData) {
  const candles = candleData?.data ?? [];
  return candles.map((c) => ({
    date: c[0],
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));
}
