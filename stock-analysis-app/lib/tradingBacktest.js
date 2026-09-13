// Historical hypothesis test: "when this stock showed similar RSI/momentum
// conditions in the past, what actually happened to the price afterward?"
// This is a real backtest against the stock's own history - not an AI
// guess, an actual calculated statistic.

function computeRSISeries(closes, period = 14) {
  const rsiValues = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) rsiValues[i] = 100;
    else rsiValues[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsiValues;
}

/**
 * Scans the stock's own price history for past days where RSI was within
 * a similar band to today's RSI, then measures what happened to price
 * over the following `lookaheadDays`. Returns a real win-rate and average
 * return based on however many similar setups actually occurred.
 */
export function runHistoricalBacktest(candleData, lookaheadDays = 5) {
  const candles = candleData?.data ?? [];
  const closes = candles.map((c) => c[4]);
  if (closes.length < 60) {
    return { sampleSize: 0, winRate: null, avgReturn: null, note: "Not enough history for a reliable backtest" };
  }

  const rsiSeries = computeRSISeries(closes);
  const currentRSI = rsiSeries[rsiSeries.length - 1];
  if (currentRSI == null) {
    return { sampleSize: 0, winRate: null, avgReturn: null, note: "Current RSI unavailable" };
  }

  const band = 8; // RSI +/- 8 counts as a "similar" setup
  const outcomes = [];

  for (let i = 20; i < rsiSeries.length - lookaheadDays; i++) {
    const pastRSI = rsiSeries[i];
    if (pastRSI == null) continue;
    if (Math.abs(pastRSI - currentRSI) <= band) {
      const priceThen = closes[i];
      const priceAfter = closes[i + lookaheadDays];
      const returnPct = ((priceAfter - priceThen) / priceThen) * 100;
      outcomes.push(returnPct);
    }
  }

  if (outcomes.length < 5) {
    return { sampleSize: outcomes.length, winRate: null, avgReturn: null, note: "Too few similar historical setups to draw a conclusion" };
  }

  const wins = outcomes.filter((r) => r > 0).length;
  const winRate = (wins / outcomes.length) * 100;
  const avgReturn = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;

  return {
    sampleSize: outcomes.length,
    winRate: Number(winRate.toFixed(1)),
    avgReturn: Number(avgReturn.toFixed(2)),
    currentRSI: Number(currentRSI.toFixed(1)),
    lookaheadDays,
    note: `Based on ${outcomes.length} similar past setups (RSI within ${band} points of today's ${currentRSI.toFixed(1)})`,
  };
}
