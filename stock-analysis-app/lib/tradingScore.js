// The Trading Opportunity Score - one deterministic number combining
// technicals, backtest results, and risk-reward quality. No AI involved;
// this is what ranks all 200 scanned stocks to find the daily top 5.

export function computeTradingOpportunityScore({ tradingScore, backtest, nearestSupport, nearestResistance, price }) {
  let score = tradingScore * 0.4; // your existing technical score, 40% weight

  // Backtest contributes up to 35 points, scaled by both win rate and
  // sample size confidence (more historical setups = more trust in it)
  if (backtest?.winRate != null) {
    const confidenceMultiplier = Math.min(1, backtest.sampleSize / 20);
    score += (backtest.winRate / 100) * 35 * confidenceMultiplier;
  } else {
    score += 17.5; // neutral contribution if no reliable backtest available
  }

  // Risk-reward contributes up to 25 points - a stock near support with
  // resistance well above it has a more favorable reward-to-risk setup
  if (nearestSupport && nearestResistance && price) {
    const risk = price - nearestSupport.level;
    const reward = nearestResistance.level - price;
    if (risk > 0) {
      const riskRewardRatio = reward / risk;
      const rrScore = Math.min(25, riskRewardRatio * 10); // ratio of 2.5+ maxes this out
      score += Math.max(0, rrScore);
    } else {
      score += 12.5; // neutral if price is at/below support (unusual data)
    }
  } else {
    score += 12.5;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
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
