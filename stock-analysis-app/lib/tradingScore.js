// The Trading Opportunity Score - one deterministic number combining
// technicals, backtest results, and risk-reward quality. No AI involved;
// this is what ranks all 200 scanned stocks to find the daily top 5.

const BACKTEST_MAX = 35;
const BACKTEST_NEUTRAL = BACKTEST_MAX / 2;
const EDGE_FULL_SCALE_PP = 20; // +20 percentage points over baseline = full marks, -20 = zero
const FULL_CONFIDENCE_SAMPLES = 20; // independent setups needed to fully trust the backtest

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function computeTradingOpportunityScore({ tradingScore, backtest, nearestSupport, nearestResistance, price }) {
  let score = tradingScore * 0.4; // technical score, 40% weight

  // Backtest contributes up to 35 points. What counts is the edge over how
  // often *any* 5-day window in this stock's history was positive, not the
  // raw win rate. With few independent samples the contribution is pulled
  // toward neutral (rather than toward zero, which used to penalise a stock
  // just for having a short history).
  if (backtest?.winRate != null) {
    const baseline = backtest.baselineWinRate ?? 50; // older saved scans have no baseline
    const edge = backtest.winRate - baseline;
    const raw = BACKTEST_MAX * clamp(0.5 + edge / (2 * EDGE_FULL_SCALE_PP), 0, 1);
    const confidence = clamp((backtest.sampleSize ?? 0) / FULL_CONFIDENCE_SAMPLES, 0, 1);
    score += BACKTEST_NEUTRAL + (raw - BACKTEST_NEUTRAL) * confidence;
  } else {
    score += BACKTEST_NEUTRAL; // neutral contribution if no reliable backtest available
  }

  // Risk-reward contributes up to 25 points - a stock near support with
  // resistance well above it has a more favorable reward-to-risk setup.
  // Risk is floored at 1% of price: a support level a few paise away would
  // otherwise produce an enormous ratio, but a stop that tight sits inside
  // normal day-to-day noise.
  if (nearestSupport && nearestResistance && price) {
    const rawRisk = price - nearestSupport.level;
    const reward = nearestResistance.level - price;
    if (rawRisk > 0) {
      const risk = Math.max(rawRisk, price * 0.01);
      const riskRewardRatio = reward / risk;
      const rrScore = Math.min(25, riskRewardRatio * 10); // ratio of 2.5+ maxes this out
      score += Math.max(0, rrScore);
    } else {
      score += 12.5; // neutral if price is at/below support (unusual data)
    }
  } else {
    score += 12.5;
  }

  return Math.round(clamp(score, 0, 100));
}

/**
 * Computes a stop-loss and target based on risk-reward, anchored to the
 * nearest calculated support level - not an arbitrary percentage.
 */
export function computeRiskRewardLevels({ price, nearestSupport, nearestResistance, rewardRiskRatio = 2 }) {
  if (!price) return null;

  const stopLoss = nearestSupport
    ? Number((nearestSupport.level * 0.995).toFixed(2)) // slightly below support, avoids exact-level noise
    : Number((price * 0.95).toFixed(2)); // fallback: 5% below if no support found

  const risk = price - stopLoss;
  const target = nearestResistance && nearestResistance.level > price
    ? Number(nearestResistance.level.toFixed(2))
    : Number((price + risk * rewardRiskRatio).toFixed(2));

  const reward = target - price;
  const actualRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : null;

  return { entry: price, stopLoss, target, riskRewardRatio: actualRatio };
}
