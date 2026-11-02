// Intraday-specific technical indicators. Kept separate from lib/technicals.js
// (which serves your existing daily-candle Swing/Trading page) since these
// operate on intraday candles and include indicators not used elsewhere.
//
// Each function is independent and testable, per the modular design
// requirement - no single monolithic calculation function.

/**
 * Volume Weighted Average Price, calculated from the day's candles so far.
 * candles: array of {timestamp, open, high, low, close, volume}, same-day only.
 */
export function calculateVWAP(candles) {
  if (!candles || candles.length === 0) return null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * (c.volume || 0);
    cumulativeVolume += c.volume || 0;
  }
  if (cumulativeVolume === 0) return null;
  return Number((cumulativePV / cumulativeVolume).toFixed(2));
}

/**
 * Exponential Moving Average over the given period, using closing prices.
 */
export function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period; // seed with SMA
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

/**
 * Average True Range - a volatility measure independent of price direction.
 */
export function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trueRanges.push(tr);
  }

  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
  return Number(atr.toFixed(2));
}

// Candle timestamps look like "2026-11-02T09:15:00+05:30" (exchange local
// time), so the date and the time-of-day can be read straight off the string.
function dateOf(timestamp) {
  return timestamp?.slice(0, 10) ?? null;
}

function minutesOf(timestamp) {
  const hhmm = timestamp?.slice(11, 16);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/**
 * Average volume per trading day over the days present in `candles`,
 * optionally leaving one date out (the day being scored, which is usually
 * only partly complete).
 *
 * The previous version summed the whole window and always divided by 20, but
 * 20 calendar days only holds ~14 trading days, so the baseline came out about
 * 30% too low - which inflated relative volume and the liquidity score.
 */
export function calculateAvgDailyVolume(candles, excludeDate = null) {
  const byDate = new Map();
  for (const c of candles ?? []) {
    const d = dateOf(c.timestamp);
    if (!d || d === excludeDate) continue;
    byDate.set(d, (byDate.get(d) ?? 0) + (c.volume || 0));
  }
  if (byDate.size === 0) return null;
  const total = [...byDate.values()].reduce((a, b) => a + b, 0);
  return total / byDate.size;
}

/**
 * Relative Volume, adjusted for time of day: today's volume so far compared
 * with what prior days had traded by the SAME point in the session. A value
 * of 1.5 means "50% more volume than typical for this time of day".
 *
 * Comparing volume-so-far with a FULL day's average (what this used to do)
 * makes every stock look quiet in the morning and busy by the close.
 *
 * Both sides are measured up to the same 15-minute boundary so partial
 * candles don't skew the ratio. Returns null when there isn't enough to
 * compare (market just opened, or fewer than `minPriorDays` earlier days).
 */
export function calculateRelativeVolumeByTimeOfDay(todayCandles5min, candles15min, minPriorDays = 3) {
  if (!todayCandles5min?.length || !candles15min?.length) return null;

  const last = todayCandles5min[todayCandles5min.length - 1];
  const todayDate = dateOf(last.timestamp);
  const lastStart = minutesOf(last.timestamp);
  const sessionStart = minutesOf(todayCandles5min[0].timestamp);
  if (lastStart == null || sessionStart == null) return null;

  // The last 5-min candle ends at lastStart + 5; round that down to a 15-min
  // boundary so both sides are measured over whole 15-minute buckets.
  const cutoff = Math.floor((lastStart + 5) / 15) * 15;
  if (cutoff <= sessionStart) return null; // less than one full bucket traded so far

  const todayVolume = todayCandles5min
    .filter((c) => {
      const start = minutesOf(c.timestamp);
      return start != null && start + 5 <= cutoff;
    })
    .reduce((sum, c) => sum + (c.volume || 0), 0);

  const volumeByDay = new Map();
  for (const c of candles15min) {
    const d = dateOf(c.timestamp);
    const start = minutesOf(c.timestamp);
    if (!d || d === todayDate || start == null) continue;
    if (!volumeByDay.has(d)) volumeByDay.set(d, 0);
    if (start + 15 <= cutoff) volumeByDay.set(d, volumeByDay.get(d) + (c.volume || 0));
  }

  if (volumeByDay.size < minPriorDays) return null;
  const avg = [...volumeByDay.values()].reduce((a, b) => a + b, 0) / volumeByDay.size;
  if (!avg) return null;
  return Number((todayVolume / avg).toFixed(2));
}

/**
 * Simple ratio of today's volume so far to a FULL-day average. Only
 * meaningful once the session is over; kept for callers that need it.
 * Prefer calculateRelativeVolumeByTimeOfDay during the session.
 */
export function calculateRelativeVolume(todayCandles, historicalAvgVolume) {
  if (!todayCandles || todayCandles.length === 0) return null;
  const todayVolumeSoFar = todayCandles.reduce((sum, c) => sum + (c.volume || 0), 0);
  if (!historicalAvgVolume || historicalAvgVolume === 0) return null;
  return Number((todayVolumeSoFar / historicalAvgVolume).toFixed(2));
}

/**
 * RSI, reused pattern from the existing Swing-mode calculation but kept
 * here too since intraday RSI operates on intraday-interval candles.
 */
export function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

/**
 * Higher-high/higher-low (or lower-high/lower-low) structure check over
 * the recent candles - used for trend confirmation.
 */
export function detectPriceStructure(candles, lookback = 6) {
  if (!candles || candles.length < lookback) return "insufficient_data";
  const recent = candles.slice(-lookback);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);

  const higherHighs = highs.every((h, i) => i === 0 || h >= highs[i - 1]);
  const higherLows = lows.every((l, i) => i === 0 || l >= lows[i - 1]);
  const lowerHighs = highs.every((h, i) => i === 0 || h <= highs[i - 1]);
  const lowerLows = lows.every((l, i) => i === 0 || l <= lows[i - 1]);

  if (higherHighs && higherLows) return "uptrend";
  if (lowerHighs && lowerLows) return "downtrend";
  return "mixed";
}

/**
 * Runs every indicator needed for scoring, in one place, with graceful
 * fallback (null) for anything that can't be calculated - per the spec's
 * "do not fail the whole process if one indicator is unavailable" rule.
 */
export function calculateAllIndicators(candles5min, candles15min, historicalAvgVolume) {
  const closes5min = candles5min.map((c) => c.close);
  const currentPrice = closes5min.at(-1) ?? null;
  const dayOpen = candles5min[0]?.open ?? null;

  return {
    currentPrice,
    priceChange: currentPrice && dayOpen ? Number((currentPrice - dayOpen).toFixed(2)) : null,
    priceChangePercentage: currentPrice && dayOpen ? Number((((currentPrice - dayOpen) / dayOpen) * 100).toFixed(2)) : null,
    vwap: calculateVWAP(candles5min),
    ema9: calculateEMA(closes5min, 9),
    ema20: calculateEMA(closes5min, 20),
    rsi: calculateRSI(closes5min, 14),
    atr: calculateATR(candles5min, 14),
    relativeVolume: calculateRelativeVolumeByTimeOfDay(candles5min, candles15min),
    trend5min: detectPriceStructure(candles5min, 6),
    trend15min: detectPriceStructure(candles15min, 6),
  };
}
