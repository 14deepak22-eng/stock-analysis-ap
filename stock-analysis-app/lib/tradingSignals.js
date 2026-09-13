// Support/resistance calculation and reliable pattern detection.
// All pure math on candle data - no AI, no API calls, fully deterministic
// and testable.

/**
 * Finds swing highs and lows - local peaks and troughs in price over a
 * window of candles. A swing high is a candle whose high is greater than
 * the highs on both sides within the window; swing low is the mirror.
 */
export function findSwingPoints(candles, window = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = window; i < candles.length - window; i++) {
    const slice = candles.slice(i - window, i + window + 1);
    const current = candles[i];

    const isHigh = slice.every((c) => c[2] <= current[2]); // c[2] = high
    const isLow = slice.every((c) => c[3] >= current[3]); // c[3] = low

    if (isHigh) swingHighs.push({ date: current[0]?.slice(0, 10), price: current[2] });
    if (isLow) swingLows.push({ date: current[0]?.slice(0, 10), price: current[3] });
  }

  return { swingHighs: swingHighs.slice(-6), swingLows: swingLows.slice(-6) };
}

/**
 * Classic pivot point formula, using the most recent completed candle.
 * Gives one pivot, two resistance levels, and two support levels.
 */
export function calculatePivotPoints(candles) {
  const last = candles[candles.length - 1];
  if (!last) return null;
  const high = last[2];
  const low = last[3];
  const close = last[4];

  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);

  return {
    pivot: Number(pivot.toFixed(2)),
    resistance: [Number(r1.toFixed(2)), Number(r2.toFixed(2))],
    support: [Number(s1.toFixed(2)), Number(s2.toFixed(2))],
  };
}

/**
 * Combines all three support/resistance methods into one clean structure.
 */
export function calculateSupportResistance(candles, ma50, ma200) {
  const { swingHighs, swingLows } = findSwingPoints(candles);
  const pivots = calculatePivotPoints(candles);

  const resistance = [
    ...swingHighs.map((s) => ({ level: s.price, type: "Swing high", date: s.date })),
    ...(pivots ? pivots.resistance.map((p) => ({ level: p, type: "Pivot resistance" })) : []),
    ...(ma200 ? [{ level: Number(ma200.toFixed(2)), type: "200-day average" }] : []),
  ].sort((a, b) => a.level - b.level);

  const support = [
    ...swingLows.map((s) => ({ level: s.price, type: "Swing low", date: s.date })),
    ...(pivots ? pivots.support.map((p) => ({ level: p, type: "Pivot support" })) : []),
    ...(ma50 ? [{ level: Number(ma50.toFixed(2)), type: "50-day average" }] : []),
  ].sort((a, b) => b.level - a.level);

  return { support, resistance, pivots };
}

/**
 * Nearest support below current price and nearest resistance above it -
 * the two levels that actually matter for a trading decision right now.
 */
export function nearestLevels(price, support, resistance) {
  const nearestSupport = support.filter((s) => s.level < price).sort((a, b) => b.level - a.level)[0] || null;
  const nearestResistance = resistance.filter((r) => r.level > price).sort((a, b) => a.level - b.level)[0] || null;
  return { nearestSupport, nearestResistance };
}

// --- Reliable pattern detection (v1 set) -------------------------------

function linearRegressionSlope(values) {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function detectTrendStructure(candles) {
  const recent = candles.slice(-40);
  const closes = recent.map((c) => c[4]);
  const slope = linearRegressionSlope(closes);
  const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
  const normalizedSlope = (slope / avgPrice) * 100; // % per candle

  if (normalizedSlope > 0.15) return { name: "Uptrend structure", detail: "Higher highs and higher lows over the recent period" };
  if (normalizedSlope < -0.15) return { name: "Downtrend structure", detail: "Lower highs and lower lows over the recent period" };
  return null;
}

function detectRangeBound(candles) {
  const recent = candles.slice(-30);
  const closes = recent.map((c) => c[4]);
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const rangePct = ((high - low) / avg) * 100;

  if (rangePct < 8) {
    return { name: "Range-bound / sideways", detail: `Price has stayed within a ${rangePct.toFixed(1)}% band over the last 30 sessions` };
  }
  return null;
}

function detectDoubleTopBottom(swingHighs, swingLows) {
  const patterns = [];
  if (swingHighs.length >= 2) {
    const [a, b] = swingHighs.slice(-2);
    const diffPct = (Math.abs(a.price - b.price) / a.price) * 100;
    if (diffPct < 2) {
      patterns.push({ name: "Possible double top", detail: `Two recent swing highs within ${diffPct.toFixed(1)}% of each other (${a.date}, ${b.date})` });
    }
  }
  if (swingLows.length >= 2) {
    const [a, b] = swingLows.slice(-2);
    const diffPct = (Math.abs(a.price - b.price) / a.price) * 100;
    if (diffPct < 2) {
      patterns.push({ name: "Possible double bottom", detail: `Two recent swing lows within ${diffPct.toFixed(1)}% of each other (${a.date}, ${b.date})` });
    }
  }
  return patterns;
}

function detectVolatilitySqueeze(candles) {
  const recent = candles.slice(-20);
  const older = candles.slice(-60, -20);
  if (older.length < 20) return null;

  const stdDev = (arr) => {
    const closes = arr.map((c) => c[4]);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length;
    return Math.sqrt(variance) / mean;
  };

  const recentVol = stdDev(recent);
  const olderVol = stdDev(older);

  if (recentVol < olderVol * 0.6) {
    return { name: "Volatility squeeze", detail: "Price movement has tightened significantly - often precedes a breakout in either direction" };
  }
  return null;
}

/**
 * Runs all reliable v1 pattern detectors and returns whichever ones fired.
 */
export function detectPatterns(candles) {
  const { swingHighs, swingLows } = findSwingPoints(candles);
  const patterns = [];

  const trend = detectTrendStructure(candles);
  if (trend) patterns.push(trend);

  const range = detectRangeBound(candles);
  if (range) patterns.push(range);

  patterns.push(...detectDoubleTopBottom(swingHighs, swingLows));

  const squeeze = detectVolatilitySqueeze(candles);
  if (squeeze) patterns.push(squeeze);

  return patterns;
}
