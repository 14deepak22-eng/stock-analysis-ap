// ---------------------------------------------------------------------
// Deterministic scoring engine.
//
// IMPORTANT: nothing in this file calls an AI model. Scores must be
// reproducible math so a user can trust and trace them. The AI's only
// job (see lib/ai/explain.js) is to explain a score that already exists.
// ---------------------------------------------------------------------

/**
 * Converts a raw metric into a 0-100 score by comparing it against the
 * stock's sector peers (z-score), then squashing to a 0-100 range.
 *
 * @param {number} value - the stock's own metric value (e.g. its P/E)
 * @param {number} sectorMedian - the sector's median value for this metric
 * @param {number} sectorStd - the sector's standard deviation for this metric
 * @param {boolean} lowerIsBetter - true for metrics like P/E or debt/equity
 *                                  where a LOWER number is a better sign
 */
export function scoreMetric(value, sectorMedian, sectorStd, lowerIsBetter = false) {
  if (value === null || value === undefined) return 50; // neutral if data missing
  const std = sectorStd || 1; // avoid divide-by-zero
  let z = (value - sectorMedian) / std;
  if (lowerIsBetter) z = -z;
  const score = 50 + z * 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Weights for the Investment score. Must sum to 1.
const INVESTMENT_WEIGHTS = {
  pe_ratio: { weight: 0.15, lowerIsBetter: true },
  peg_ratio: { weight: 0.1, lowerIsBetter: true },
  roe: { weight: 0.15, lowerIsBetter: false },
  roce: { weight: 0.1, lowerIsBetter: false },
  debt_to_equity: { weight: 0.15, lowerIsBetter: true },
   revenue_growth_yoy: { weight: 0.15, lowerIsBetter: false },
  net_margin: { weight: 0.1, lowerIsBetter: false },
  promoter_holding: { weight: 0.1, lowerIsBetter: false },
};

/**
 * Computes the Investment score (0-100) from a fundamentals row.
 * `fundamentals` should have the raw metric values plus sector
 * median/std for each metric (see stock_fundamentals table).
 */
export function computeInvestmentScore(fundamentals) {
  let total = 0;
  for (const [metric, config] of Object.entries(INVESTMENT_WEIGHTS)) {
    const value = fundamentals[metric];
    const sectorMedian = fundamentals[`sector_${metric}_median`] ?? value;
    const sectorStd = fundamentals[`sector_${metric}_std`] ?? 1;
    const s = scoreMetric(value, sectorMedian, sectorStd, config.lowerIsBetter);
    total += s * config.weight;
  }
  return Math.round(total);
}

// --- Trading score -----------------------------------------------------

function rsiSubScore(rsi) {
  // 50 = neutral. Penalize distance from 50, extra penalty past 70/30.
  if (rsi === null || rsi === undefined) return 50;
  if (rsi > 70) return Math.max(0, 100 - (rsi - 50) * 2.5);
  if (rsi < 30) return Math.max(0, 100 - (50 - rsi) * 2.5);
  return 100 - Math.abs(rsi - 50);
}

function movingAverageSubScore(price, ma) {
  if (!price || !ma) return 50;
  const pctAbove = ((price - ma) / ma) * 100;
  // Being modestly above the average is bullish; extreme extension is not.
  const score = 50 + pctAbove * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function macdSubScore(macdLine, signalLine) {
  if (macdLine === null || signalLine === null) return 50;
  return macdLine > signalLine ? 65 : 35; // simple bullish/bearish crossover
}

function volumeTrendSubScore(recentVolume, avgVolume, priceRising) {
  if (!recentVolume || !avgVolume) return 50;
  const risingVolume = recentVolume > avgVolume;
  if (priceRising && risingVolume) return 75; // healthy confirmation
  if (!priceRising && risingVolume) return 30; // selling pressure
  return 50;
}

/**
 * Computes the Trading score (0-100) from a technical-signals object.
 * Expects: { price, ma50, ma200, rsi, macdLine, macdSignal,
 *            recentVolume, avgVolume, priceRising }
 */
export function computeTradingScore(signals) {
  const scores = {
    price_vs_50dma: movingAverageSubScore(signals.price, signals.ma50) * 0.2,
    price_vs_200dma: movingAverageSubScore(signals.price, signals.ma200) * 0.2,
    rsi_zone: rsiSubScore(signals.rsi) * 0.2,
    macd_signal: macdSubScore(signals.macdLine, signals.macdSignal) * 0.2,
    volume_trend:
      volumeTrendSubScore(signals.recentVolume, signals.avgVolume, signals.priceRising) * 0.2,
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return Math.round(total);
}
