// Entry/stop-loss/target calculation for intraday setups, using
// VWAP/EMA support and ATR - per spec, never shown if data is insufficient.

export function calculateRiskLevels(indicators) {
  if (indicators.currentPrice == null || indicators.atr == null) {
    return null; // insufficient data - spec requires not showing levels at all
  }

  const price = indicators.currentPrice;

  // Entry: near VWAP if price is close to it, otherwise current price
  const entry = indicators.vwap != null && Math.abs(price - indicators.vwap) / price < 0.01
    ? Number(indicators.vwap.toFixed(2))
    : Number(price.toFixed(2));

  // Stop-loss: ATR-based, below entry
  const stopLoss = Number((entry - indicators.atr * 1.2).toFixed(2));

  // Target: risk-reward based (default 1:2), since intraday resistance
  // levels aren't computed here (kept simple, per spec's "if implemented" wording)
  const risk = entry - stopLoss;
  const target = Number((entry + risk * 2).toFixed(2));

  const riskRewardRatio = risk > 0 ? Number((2).toFixed(2)) : null;

  return { entry, stopLoss, target, riskRewardRatio, basis: "ATR-based stop-loss, 1:2 risk-reward target" };
}
