import { test } from "node:test";
import assert from "node:assert/strict";
import { runHistoricalBacktest } from "../lib/tradingBacktest.js";
import { computeTradingOpportunityScore, computeRiskRewardLevels } from "../lib/tradingScore.js";

const candles = (closes) => ({ data: closes.map((c, i) => [`d${i}`, c, c, c, c, 1000]) });

// Small seeded PRNG so "random" tests are deterministic.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function randomWalk(n, seed, drift = 0) {
  const r = rng(seed);
  let p = 100;
  return Array.from({ length: n }, () => (p *= 1 + drift + (r() - 0.5) * 0.04));
}

test("samples don't overlap: a series where every day matches yields one sample per look-ahead window", () => {
  // Alternating closes keep RSI around the same level every day, so EVERY day is a "similar setup".
  const closes = Array.from({ length: 300 }, (_, i) => (i % 2 ? 101 : 100));
  const b = runHistoricalBacktest(candles(closes), 5);
  // eligible start days are 30..294 -> 53 non-overlapping windows (the old code would report 265)
  assert.equal(b.sampleSize, 53);
});

test("reports a baseline, an edge and a pessimistic win-rate bound", () => {
  const b = runHistoricalBacktest(candles(randomWalk(400, 42, 0.002)), 5);
  assert.ok(b.sampleSize >= 8, `sampleSize=${b.sampleSize}`);
  for (const k of ["baselineWinRate", "baselineAvgReturn", "edge", "winRateLowerBound", "winRate", "avgReturn", "currentRSI"]) {
    assert.notEqual(b[k], undefined, `missing ${k}`);
  }
  assert.ok(b.winRateLowerBound < b.winRate, "lower bound must be below the point estimate");
  assert.equal(Number((b.winRate - b.baselineWinRate).toFixed(1)), b.edge);
});

test("in a steadily rising market every window is a 'win' - baseline is 100%, edge is 0", () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.5);
  const b = runHistoricalBacktest(candles(closes), 5);
  assert.equal(b.baselineWinRate, 100);
  assert.equal(b.winRate, 100);
  assert.equal(b.edge, 0);
});

test("too few similar setups -> no win rate, with an honest note", () => {
  const closes = [...new Array(280).fill(100), ...Array.from({ length: 12 }, (_, i) => 100 * 1.02 ** (i + 1))];
  const b = runHistoricalBacktest(candles(closes), 5);
  assert.equal(b.winRate, null);
  assert.match(b.note, /too few/i);
});

test("not enough history is handled", () => {
  const b = runHistoricalBacktest(candles([1, 2, 3]));
  assert.equal(b.winRate, null);
  assert.match(b.note, /not enough history/i);
});

const sr = { nearestSupport: { level: 95 }, nearestResistance: { level: 115 }, price: 100 };
const bt = (over) => ({ winRate: 70, baselineWinRate: 55, sampleSize: 20, ...over });

test("opportunity score: edge over baseline is what counts, not the raw win rate", () => {
  const goodEdge = computeTradingOpportunityScore({ tradingScore: 60, backtest: bt({ winRate: 70, baselineWinRate: 55 }), ...sr });
  const noEdge = computeTradingOpportunityScore({ tradingScore: 60, backtest: bt({ winRate: 70, baselineWinRate: 70 }), ...sr });
  const negEdge = computeTradingOpportunityScore({ tradingScore: 60, backtest: bt({ winRate: 70, baselineWinRate: 85 }), ...sr });
  assert.ok(goodEdge > noEdge && noEdge > negEdge);
});

test("opportunity score: few samples pull toward neutral in BOTH directions", () => {
  const pos = (n) => computeTradingOpportunityScore({ tradingScore: 60, backtest: bt({ winRate: 80, baselineWinRate: 55, sampleSize: n }), ...sr });
  const neg = (n) => computeTradingOpportunityScore({ tradingScore: 60, backtest: bt({ winRate: 40, baselineWinRate: 55, sampleSize: n }), ...sr });
  const none = computeTradingOpportunityScore({ tradingScore: 60, backtest: { winRate: null }, ...sr });
  assert.ok(pos(20) > pos(4) && pos(4) >= none);
  assert.ok(neg(20) < neg(4) && neg(4) <= none);
});

test("opportunity score: a support level a hair below price doesn't produce a runaway risk-reward bonus", () => {
  const tiny = computeTradingOpportunityScore({ tradingScore: 60, backtest: null, nearestSupport: { level: 99.9 }, nearestResistance: { level: 115 }, price: 100 });
  const onePct = computeTradingOpportunityScore({ tradingScore: 60, backtest: null, nearestSupport: { level: 99 }, nearestResistance: { level: 115 }, price: 100 });
  assert.equal(tiny, onePct);
});

test("opportunity score stays within 0-100 and risk-reward levels still compute", () => {
  const s = computeTradingOpportunityScore({ tradingScore: 100, backtest: bt({ winRate: 100, baselineWinRate: 30, sampleSize: 50 }), ...sr });
  assert.ok(s >= 0 && s <= 100);
  const rr = computeRiskRewardLevels({ price: 100, nearestSupport: { level: 95 }, nearestResistance: { level: 115 } });
  assert.ok(Math.abs(rr.stopLoss - 94.525) < 0.01);
  assert.equal(rr.target, 115);
});
