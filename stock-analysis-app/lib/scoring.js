// ---------------------------------------------------------------------
// Deterministic scoring engine.
//
// IMPORTANT: nothing in this file calls an AI model. Scores must be
// reproducible math so a user can trust and trace them. The AI's only
// job (see lib/ai/explain.js) is to explain a score that already exists.
//
// Missing data is never scored as "neutral 50". A metric (or indicator)
// that can't be calculated is left out and the remaining weights are
// re-scaled to add up to 100%, and the result reports how much of the
// intended weight was actually available (`coverage`).
// ---------------------------------------------------------------------

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ----- Investment score ----------------------------------------------

// A z-score beyond +/- Z_CLIP is treated the same as Z_CLIP, so one wild
// metric can't swing the whole score.
const Z_CLIP = 2.5;
const POINTS_PER_Z = 20; // 50 +/- 20 per standard deviation, as before
const LOSS_MAKING_SCORE = 10; // PE / PEG <= 0: negative earnings are bad, not "cheap"
const NEGATIVE_EQUITY_SCORE = 5; // debt-to-equity < 0: negative equity

export const INVESTMENT_WEIGHTS = {
  pe_ratio: { weight: 0.15, lowerIsBetter: true, nonPositiveIsBad: true },
  peg_ratio: { weight: 0.1, lowerIsBetter: true, nonPositiveIsBad: true },
  roe: { weight: 0.15, lowerIsBetter: false },
  roce: { weight: 0.1, lowerIsBetter: false },
  debt_to_equity: { weight: 0.15, lowerIsBetter: true, negativeIsBad: true },
  revenue_growth_yoy: { weight: 0.15, lowerIsBetter: false },
  net_margin: { weight: 0.1, lowerIsBetter: false },
  promoter_holding: { weight: 0.1, lowerIsBetter: false },
};

/**
 * Scores one metric 0-100 against its sector. Returns null when it can't be
 * scored (no value, or no usable sector comparison) so the caller can skip it.
 */
export function scoreMetric(value, sectorMedian, sectorScale, lowerIsBetter = false) {
  if (!isNum(value) || !isNum(sectorMedian) || !isNum(sectorScale) || sectorScale <= 0) {
    return null;
  }
  let z = clamp((value - sectorMedian) / sectorScale, -Z_CLIP, Z_CLIP);
  if (lowerIsBetter) z = -z;
  return Math.round(clamp(50 + z * POINTS_PER_Z, 0, 100));
}

function statsFor(metric, fundamentals, sectorStats) {
  const s = sectorStats?.[metric];
  if (s) return s;
  // Backwards compatibility: older saved data carries flat keys.
  const median = fundamentals[`sector_${metric}_median`];
  const scale = fundamentals[`sector_${metric}_scale`] ?? fundamentals[`sector_${metric}_std`];
  return isNum(median) && isNum(scale) ? { median, scale } : null;
}

/**
 * Full Investment-score breakdown.
 * Returns { score, coverage, confidence, metrics } where `metrics` lists the
 * sub-score (or why it was skipped) for each input.
 */
export function computeInvestmentScoreDetailed(fundamentals, sectorStats = null) {
  const f = fundamentals ?? {};
  const totalWeight = Object.values(INVESTMENT_WEIGHTS).reduce((a, c) => a + c.weight, 0);
  let weightedSum = 0;
  let usedWeight = 0;
  const metrics = {};

  for (const [metric, config] of Object.entries(INVESTMENT_WEIGHTS)) {
    const value = f[metric];
    let subScore = null;
    let note = null;

    if (!isNum(value)) {
      note = "no data";
    } else if (config.nonPositiveIsBad && value <= 0) {
      subScore = LOSS_MAKING_SCORE;
      note = "zero or negative (loss-making)";
    } else if (config.negativeIsBad && value < 0) {
      subScore = NEGATIVE_EQUITY_SCORE;
      note = "negative (negative equity)";
    } else {
      const stats = statsFor(metric, f, sectorStats);
      if (!stats) {
        note = "not enough sector peers to compare";
      } else {
        subScore = scoreMetric(value, stats.median, stats.scale, config.lowerIsBetter);
      }
    }

    metrics[metric] = { value: isNum(value) ? value : null, subScore, weight: config.weight, note };
    if (subScore != null) {
      weightedSum += subScore * config.weight;
      usedWeight += config.weight;
    }
  }

  const coverage = usedWeight / totalWeight;
  // With nothing to score, report a neutral 50 but coverage 0 so callers and
  // the UI can see it is a placeholder, not a verdict.
  const score = usedWeight > 0 ? Math.round(weightedSum / usedWeight) : 50;

  return { score, coverage, confidence: confidenceLabel(coverage), metrics };
}

export function computeInvestmentScore(fundamentals, sectorStats = null) {
  return computeInvestmentScoreDetailed(fundamentals, sectorStats).score;
}

function confidenceLabel(coverage) {
  if (coverage >= 0.75) return "high";
  if (coverage >= 0.5) return "medium";
  return "low";
}

// ----- Trading score -------------------------------------------------

// 30-70 is the "healthy" zone (50 is the peak, 80 at the edges). Outside it
// the score falls away continuously - the old version dropped from 80 to 50
// the moment RSI crossed 70 (or 30).
function rsiSubScore(rsi) {
  if (!isNum(rsi)) return null;
  if (rsi > 70) return Math.max(0, 80 - (rsi - 70) * 2.5);
  if (rsi < 30) return Math.max(0, 80 - (30 - rsi) * 2.5);
  return 100 - Math.abs(rsi - 50);
}

function movingAverageSubScore(price, ma) {
  if (!isNum(price) || !isNum(ma) || ma === 0) return null;
  const pctAbove = ((price - ma) / ma) * 100;
  return clamp(Math.round(50 + pctAbove * 3), 0, 100);
}

// Direction (line vs signal) and side of the zero line both matter.
function macdSubScore(macdLine, macdSignal) {
  if (!isNum(macdLine) || !isNum(macdSignal)) return null;
  const bullishCross = macdLine > macdSignal;
  const aboveZero = macdLine > 0;
  if (bullishCross && aboveZero) return 75;
  if (bullishCross) return 60;
  if (aboveZero) return 45;
  return 30;
}

function volumeTrendSubScore(recentVolume, avgVolume, priceRising) {
  if (!isNum(recentVolume) || !isNum(avgVolume) || avgVolume === 0 || priceRising == null) {
    return null;
  }
  const risingVolume = recentVolume > avgVolume;
  if (priceRising && risingVolume) return 75;
  if (!priceRising && risingVolume) return 30;
  return 50;
}

const TRADING_WEIGHT = 0.2; // five components, equal weight

export function computeTradingScoreDetailed(signals) {
  const s = signals ?? {};
  const components = {
    price_vs_50dma: movingAverageSubScore(s.price, s.ma50),
    price_vs_200dma: movingAverageSubScore(s.price, s.ma200),
    rsi_zone: rsiSubScore(s.rsi),
    macd_signal: macdSubScore(s.macdLine, s.macdSignal),
    volume_trend: volumeTrendSubScore(s.recentVolume, s.avgVolume, s.priceRising),
  };

  let weightedSum = 0;
  let usedWeight = 0;
  for (const value of Object.values(components)) {
    if (value != null) {
      weightedSum += value * TRADING_WEIGHT;
      usedWeight += TRADING_WEIGHT;
    }
  }

  const coverage = usedWeight / (TRADING_WEIGHT * Object.keys(components).length);
  const score = usedWeight > 0 ? Math.round(weightedSum / usedWeight) : 50;
  return { score, coverage, confidence: confidenceLabel(coverage), components };
}

export function computeTradingScore(signals) {
  return computeTradingScoreDetailed(signals).score;
}

/**
 * Overall score: a simple blend of Investment (60%) and Trading (40%)
 * scores, shown as a single at-a-glance number. The individual scores
 * still show separately below it - this is just a summary on top.
 */
export function computeOverallScore(investmentScore, tradingScore) {
  if (!isNum(investmentScore) && !isNum(tradingScore)) return null;
  if (!isNum(investmentScore)) return Math.round(tradingScore);
  if (!isNum(tradingScore)) return Math.round(investmentScore);
  return Math.round(investmentScore * 0.6 + tradingScore * 0.4);
}
