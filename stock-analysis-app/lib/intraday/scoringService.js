// Intraday scoring engine. Each component is a separate, independently
// testable function per the spec's modularity requirement - no single
// monolithic scoring function.
//
// Weights: Momentum 25, Volume 25, Volatility 20, Liquidity 20,
// Market alignment 10 = 100 total.

export function calculateMomentumScore(indicators) {
  if (indicators.currentPrice == null) return { score: 0, maxScore: 25, reason: "No price data" };

  let points = 0;
  const reasons = [];

  if (indicators.priceChangePercentage != null && indicators.priceChangePercentage > 0) {
    points += 6;
    reasons.push("Positive price change");
  }
  if (indicators.vwap != null && indicators.currentPrice > indicators.vwap) {
    points += 6;
    reasons.push("Price above VWAP");
  }
  if (indicators.ema9 != null && indicators.ema20 != null && indicators.ema9 > indicators.ema20) {
    points += 6;
    reasons.push("EMA9 above EMA20 (short-term bullish)");
  }
  if (indicators.rsi != null && indicators.rsi >= 45 && indicators.rsi <= 70) {
    points += 4;
    reasons.push("RSI in healthy momentum range");
  }
  if (indicators.trend5min === "uptrend") {
    points += 3;
    reasons.push("Higher highs / higher lows on 5-min chart");
  }

  return { score: Math.min(25, points), maxScore: 25, reasons };
}

export function calculateVolumeScore(indicators) {
  if (indicators.relativeVolume == null) {
    return { score: 12.5, maxScore: 25, reasons: ["Relative volume unavailable - neutral score applied"] };
  }

  let points = 0;
  const reasons = [];

  if (indicators.relativeVolume >= 2) {
    points += 15;
    reasons.push("Volume spike (2x+ typical)");
  } else if (indicators.relativeVolume >= 1.3) {
    points += 10;
    reasons.push("Above-average volume");
  } else if (indicators.relativeVolume >= 0.8) {
    points += 5;
    reasons.push("Roughly typical volume");
  } else {
    reasons.push("Below-average volume - weak confirmation");
  }

  // Volume should confirm price direction, not contradict it
  if (indicators.priceChangePercentage > 0 && indicators.relativeVolume >= 1.3) {
    points += 10;
    reasons.push("Price gain supported by real volume");
  } else if (indicators.priceChangePercentage > 0 && indicators.relativeVolume < 0.8) {
    reasons.push("Price gain not supported by volume - lower confidence");
  }

  return { score: Math.min(25, points), maxScore: 25, reasons };
}

export function calculateVolatilityScore(indicators) {
  if (indicators.atr == null || indicators.currentPrice == null) {
    return { score: 10, maxScore: 20, reasons: ["ATR unavailable - neutral score applied"] };
  }

  const atrPercent = (indicators.atr / indicators.currentPrice) * 100;
  let points = 0;
  const reasons = [];

  if (atrPercent < 0.3) {
    points = 5;
    reasons.push("Very low volatility - limited intraday opportunity");
  } else if (atrPercent <= 1.5) {
    points = 20;
    reasons.push("Volatility well-suited for intraday trading");
  } else if (atrPercent <= 3) {
    points = 12;
    reasons.push("Elevated volatility - higher risk");
  } else {
    points = 4;
    reasons.push("Excessive volatility - high risk of erratic moves");
  }

  return { score: points, maxScore: 20, reasons };
}

export function calculateLiquidityScore(indicators, historicalAvgVolume) {
  if (!historicalAvgVolume) {
    return { score: 10, maxScore: 20, reasons: ["Liquidity data unavailable - neutral score applied"] };
  }

  let points = 0;
  const reasons = [];

  if (historicalAvgVolume >= 1000000) {
    points += 15;
    reasons.push("High average trading volume");
  } else if (historicalAvgVolume >= 200000) {
    points += 10;
    reasons.push("Moderate average trading volume");
  } else {
    points += 3;
    reasons.push("Low average trading volume - illiquidity risk");
  }

  if (indicators.relativeVolume != null && indicators.relativeVolume >= 0.5) {
    points += 5;
    reasons.push("Reasonable current trading activity");
  }

  return { score: Math.min(20, points), maxScore: 20, reasons };
}

export function calculateMarketAlignmentScore(indicators, marketTrend) {
  if (!marketTrend) {
    return { score: 5, maxScore: 10, reasons: ["Market alignment data unavailable - neutral score applied"] };
  }

  let points = 0;
  const reasons = [];

  if (marketTrend === "uptrend" && indicators.priceChangePercentage > 0) {
    points = 10;
    reasons.push("Moving with a rising market");
  } else if (marketTrend === "downtrend" && indicators.priceChangePercentage < 0) {
    points = 3; // aligned with market but bearish - lower relevance for bullish scoring
    reasons.push("Moving with a falling market");
  } else if (marketTrend === "uptrend" && indicators.priceChangePercentage < 0) {
    points = 2;
    reasons.push("Moving against a rising market - caution");
  } else {
    points = 5;
    reasons.push("Neutral market alignment");
  }

  return { score: points, maxScore: 10, reasons };
}

/**
 * Combines all five component scores into the final 0-100 intraday score,
 * with validation override rules applied afterward.
 */
export function calculateIntradayScore(indicators, historicalAvgVolume, marketTrend) {
  const momentum = calculateMomentumScore(indicators);
  const volume = calculateVolumeScore(indicators);
  const volatility = calculateVolatilityScore(indicators);
  const liquidity = calculateLiquidityScore(indicators, historicalAvgVolume);
  const marketAlignment = calculateMarketAlignmentScore(indicators, marketTrend);

  let totalScore = momentum.score + volume.score + volatility.score + liquidity.score + marketAlignment.score;
  totalScore = Math.max(0, Math.min(100, totalScore));

  let signal = classifySignal(totalScore);

  // Validation override rules, per spec
  const flags = [];
  if (indicators.vwap != null && indicators.currentPrice < indicators.vwap && indicators.trend5min === "downtrend" && signal === "Strong Bullish Candidate") {
    signal = "Bullish Candidate"; // downgrade - price below VWAP with downtrend shouldn't be "Strong"
    flags.push("Downgraded from Strong Bullish: price below VWAP with negative trend");
  }
  if (indicators.relativeVolume == null) {
    flags.push("Reduced confidence: volume data missing");
  }
  if (historicalAvgVolume && historicalAvgVolume < 200000 && totalScore > 65) {
    totalScore = Math.min(totalScore, 65);
    signal = classifySignal(totalScore);
    flags.push("Score capped: poor liquidity");
  }

  return {
    totalScore: Number(totalScore.toFixed(1)),
    signal,
    componentScores: {
      momentum: momentum.score,
      volume: volume.score,
      volatility: volatility.score,
      liquidity: liquidity.score,
      marketAlignment: marketAlignment.score,
    },
    breakdown: { momentum, volume, volatility, liquidity, marketAlignment },
    flags,
  };
}

export function classifySignal(score) {
  if (score >= 80) return "Strong Bullish Candidate";
  if (score >= 65) return "Bullish Candidate";
  if (score >= 50) return "Neutral / Watchlist";
  if (score >= 35) return "Weak";
  return "Avoid / Low Score";
}
