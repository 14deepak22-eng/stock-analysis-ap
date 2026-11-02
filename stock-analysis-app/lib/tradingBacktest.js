// Historical hypothesis test: "when this stock showed similar RSI/momentum
// conditions in the past, what actually happened to the price afterward?"
// This is a real backtest against the stock's own history - not an AI
// guess, an actual calculated statistic.
//
// Three things make this more honest than the first version:
//   1. Samples don't overlap. If RSI sat in the band for 10 days in a row,
//      those are one episode, not ten independent observations - counting
//      them separately made the sample look 5x bigger than it was.
//   2. It reports a baseline. In a rising market most 5-day windows are
//      "wins" whatever the RSI was, so a 58% win rate means little next to a
//      56% baseline. The useful number is the edge over the baseline.
//   3. It reports a Wilson lower bound for the win rate, the pessimistic end
//      of what the sample can actually support.

import { rsiSeries } from "./technicals.js";

const RSI_BAND = 8; // RSI +/- 8 counts as a "similar" setup
const MIN_SAMPLES = 8; // independent setups needed before reporting a win rate
const WARMUP = 30; // skip the first sessions while Wilder's smoothing settles

function wilsonLowerBound(wins, n, z = 1.96) {
  if (n === 0) return null;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centre - margin) / denom;
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Scans the stock's own price history for past days where RSI was within
 * a similar band to today's RSI, then measures what happened to price
 * over the following `lookaheadDays`.
 */
export function runHistoricalBacktest(candleData, lookaheadDays = 5) {
  const candles = candleData?.data ?? [];
  const closes = candles.map((c) => c[4]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (closes.length < 60) {
    return { sampleSize: 0, winRate: null, avgReturn: null, note: "Not enough history for a reliable backtest" };
  }

  const rsi = rsiSeries(closes, 14);
  const currentRSI = rsi[rsi.length - 1];
  if (currentRSI == null) {
    return { sampleSize: 0, winRate: null, avgReturn: null, note: "Current RSI unavailable" };
  }

  const lastStart = closes.length - 1 - lookaheadDays; // last day with a full look-ahead window
  const forwardReturn = (i) => ((closes[i + lookaheadDays] - closes[i]) / closes[i]) * 100;

  // Baseline: every eligible day, regardless of RSI.
  const baselineReturns = [];
  for (let i = WARMUP; i <= lastStart; i++) baselineReturns.push(forwardReturn(i));

  // Similar setups, taken one episode at a time: after recording a match,
  // jump past its look-ahead window so the next sample can't overlap it.
  const outcomes = [];
  for (let i = WARMUP; i <= lastStart; ) {
    if (rsi[i] != null && Math.abs(rsi[i] - currentRSI) <= RSI_BAND) {
      outcomes.push(forwardReturn(i));
      i += lookaheadDays;
    } else {
      i++;
    }
  }

  const baselineWinRate = baselineReturns.length
    ? (baselineReturns.filter((r) => r > 0).length / baselineReturns.length) * 100
    : null;
  const baselineAvgReturn = baselineReturns.length
    ? baselineReturns.reduce((a, b) => a + b, 0) / baselineReturns.length
    : null;

  const base = {
    sampleSize: outcomes.length,
    currentRSI: Number(currentRSI.toFixed(1)),
    lookaheadDays,
    baselineWinRate: baselineWinRate != null ? Number(baselineWinRate.toFixed(1)) : null,
    baselineAvgReturn: baselineAvgReturn != null ? Number(baselineAvgReturn.toFixed(2)) : null,
  };

  if (outcomes.length < MIN_SAMPLES) {
    return {
      ...base,
      winRate: null,
      avgReturn: null,
      note: `Only ${outcomes.length} independent past setups with RSI near ${currentRSI.toFixed(1)} - too few to draw a conclusion`,
    };
  }

  const wins = outcomes.filter((r) => r > 0).length;
  const winRate = (wins / outcomes.length) * 100;
  const avgReturn = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
  const lowerBound = wilsonLowerBound(wins, outcomes.length) * 100;

  return {
    ...base,
    winRate: Number(winRate.toFixed(1)),
    avgReturn: Number(avgReturn.toFixed(2)),
    medianReturn: Number(medianOf(outcomes).toFixed(2)),
    edge: baselineWinRate != null ? Number((winRate - baselineWinRate).toFixed(1)) : null,
    winRateLowerBound: Number(lowerBound.toFixed(1)),
    note:
      `Based on ${outcomes.length} independent past setups (RSI within ${RSI_BAND} points of today's ${currentRSI.toFixed(1)}). ` +
      `For comparison, ${baselineWinRate != null ? baselineWinRate.toFixed(1) : "n/a"}% of all ${lookaheadDays}-day windows in this stock's history were positive.`,
  };
}
