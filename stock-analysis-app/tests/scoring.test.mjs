import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreMetric, computeInvestmentScore, computeInvestmentScoreDetailed,
  computeTradingScore, computeTradingScoreDetailed, computeOverallScore,
} from "../lib/scoring.js";
import { buildSectorStats, robustStats, flattenSectorStats } from "../lib/sectorStats.js";

const peers = (field, values) => values.map((v) => ({ [field]: v }));

test("sector stats: median/MAD barely move for one extreme peer, mean/std would", () => {
  const normal = robustStats([10, 12, 14, 16, 18, 20, 22]);
  const withOutlier = robustStats([10, 12, 14, 16, 18, 20, 900]);
  assert.ok(Math.abs(withOutlier.median - normal.median) <= 2);
  assert.ok(withOutlier.scale < withOutlier.std / 2, "robust scale must ignore the outlier");
});

test("sector stats: negative PE / D-E peers are dropped; too few peers -> null", () => {
  const s = buildSectorStats(peers("pe_ratio", [-5, -2, 10, 12, 14, 16, 18]));
  assert.equal(s.pe_ratio.n, 5);
  assert.ok(s.pe_ratio.median > 0);
  assert.equal(buildSectorStats(peers("roe", [10, 12, 14]))["roe"], null);
  assert.equal(buildSectorStats(peers("debt_to_equity", [-1, -1, -1, 0.5, 0.6, 0.7]))["debt_to_equity"], null);
});

test("sector stats: identical peers give null instead of a divide-by-zero scale", () => {
  assert.equal(robustStats([5, 5, 5, 5, 5, 5]), null);
});

test("flattenSectorStats keeps the keys the UI reads", () => {
  const flat = flattenSectorStats(buildSectorStats(peers("pe_ratio", [10, 12, 14, 16, 18, 20])));
  assert.ok("sector_pe_ratio_median" in flat && "sector_pe_ratio_std" in flat && "sector_pe_ratio_scale" in flat);
});

test("scoreMetric: better than sector scores higher, direction flips for lowerIsBetter, clipped to 0-100", () => {
  assert.ok(scoreMetric(30, 20, 5) > scoreMetric(20, 20, 5));
  assert.equal(scoreMetric(20, 20, 5), 50);
  assert.ok(scoreMetric(10, 20, 5, true) > 50);
  assert.equal(scoreMetric(1e9, 20, 5), 100);
  assert.equal(scoreMetric(-1e9, 20, 5), 0);
  assert.equal(scoreMetric(null, 20, 5), null);
  assert.equal(scoreMetric(10, 20, 0), null);
});

const sector = buildSectorStats([
  { pe_ratio: 20, peg_ratio: 1.5, roe: 12, roce: 14, debt_to_equity: 0.6, revenue_growth_yoy: 8, net_margin: 9, promoter_holding: 50 },
  { pe_ratio: 25, peg_ratio: 2.0, roe: 15, roce: 16, debt_to_equity: 0.8, revenue_growth_yoy: 10, net_margin: 11, promoter_holding: 55 },
  { pe_ratio: 30, peg_ratio: 2.5, roe: 18, roce: 18, debt_to_equity: 1.0, revenue_growth_yoy: 12, net_margin: 13, promoter_holding: 60 },
  { pe_ratio: 35, peg_ratio: 3.0, roe: 21, roce: 20, debt_to_equity: 1.2, revenue_growth_yoy: 14, net_margin: 15, promoter_holding: 65 },
  { pe_ratio: 40, peg_ratio: 3.5, roe: 24, roce: 22, debt_to_equity: 1.4, revenue_growth_yoy: 16, net_margin: 17, promoter_holding: 70 },
]);
const average = { pe_ratio: 30, peg_ratio: 2.5, roe: 18, roce: 18, debt_to_equity: 1.0, revenue_growth_yoy: 12, net_margin: 13, promoter_holding: 60 };
const strong = { pe_ratio: 20, peg_ratio: 1.5, roe: 24, roce: 22, debt_to_equity: 0.6, revenue_growth_yoy: 16, net_margin: 17, promoter_holding: 70 };

test("investment: an average company scores ~50, a strong one clearly higher", () => {
  const avg = computeInvestmentScore(average, sector);
  assert.ok(Math.abs(avg - 50) <= 2, `avg=${avg}`);
  assert.ok(computeInvestmentScore(strong, sector) >= 70);
});

test("investment: loss-making (negative PE/PEG) is penalised, NOT rewarded as 'cheap'", () => {
  const lossMaking = { ...average, pe_ratio: -15, peg_ratio: -1 };
  const detailed = computeInvestmentScoreDetailed(lossMaking, sector);
  assert.ok(detailed.score < computeInvestmentScore(average, sector));
  assert.equal(detailed.metrics.pe_ratio.subScore, 10);
  assert.equal(detailed.metrics.peg_ratio.subScore, 10);
});

test("investment: negative debt-to-equity (negative equity) is penalised", () => {
  const d = computeInvestmentScoreDetailed({ ...average, debt_to_equity: -0.5 }, sector);
  assert.equal(d.metrics.debt_to_equity.subScore, 5);
});

test("investment: missing metrics are skipped and weights re-scaled, not scored as 50", () => {
  const onlyGood = { roe: 24, roce: 22 }; // both well above sector, everything else missing
  const d = computeInvestmentScoreDetailed(onlyGood, sector);
  assert.ok(d.score > 70, `score=${d.score} should reflect only the available (strong) metrics`);
  assert.ok(Math.abs(d.coverage - 0.25 / 1.0) < 1e-9);
  assert.equal(d.confidence, "low");
});

test("investment: no data at all -> neutral 50 but coverage 0", () => {
  const d = computeInvestmentScoreDetailed({}, sector);
  assert.equal(d.score, 50);
  assert.equal(d.coverage, 0);
});

test("investment: no sector peers -> metric skipped (not silently z=0)", () => {
  const d = computeInvestmentScoreDetailed(strong, buildSectorStats([]));
  assert.equal(d.coverage, 0);
});

test("investment: still honours legacy flat sector_* keys on old saved data", () => {
  const legacy = { roe: 24, sector_roe_median: 18, sector_roe_std: 3 };
  const d = computeInvestmentScoreDetailed(legacy, null);
  assert.ok(d.metrics.roe.subScore > 50);
});

const trend = (over = {}) => ({
  price: 110, ma50: 100, ma200: 95, rsi: 58, macdLine: 1.2, macdSignal: 0.8,
  recentVolume: 1500, avgVolume: 1000, priceRising: true, ...over,
});

test("trading: MACD now changes the score (it used to be a constant)", () => {
  const bull = computeTradingScore(trend({ macdLine: 1.2, macdSignal: 0.8 }));
  const bear = computeTradingScore(trend({ macdLine: -1.2, macdSignal: -0.8 }));
  assert.ok(bull > bear);
});

test("trading: bullish setup outscores bearish setup", () => {
  const bullish = computeTradingScore(trend());
  const bearish = computeTradingScore(trend({ price: 80, rsi: 25, macdLine: -2, macdSignal: -1, priceRising: false }));
  assert.ok(bullish > bearish + 20);
});

test("trading: RSI sub-score is continuous across 70 and 30 (no cliff)", () => {
  const at = (rsi) => computeTradingScoreDetailed(trend({ rsi })).components.rsi_zone;
  assert.ok(Math.abs(at(70) - at(70.1)) < 1);
  assert.ok(Math.abs(at(30) - at(29.9)) < 1);
  assert.ok(at(50) > at(70) && at(70) > at(85));
});

test("trading: missing indicators are skipped, not scored as 50", () => {
  const d = computeTradingScoreDetailed(trend({ ma200: null, macdLine: null, macdSignal: null }));
  assert.ok(Math.abs(d.coverage - 0.6) < 1e-9);
  assert.equal(d.components.price_vs_200dma, null);
  assert.equal(computeTradingScoreDetailed({}).score, 50);
});

test("overall score blends 60/40 and copes with a missing side", () => {
  assert.equal(computeOverallScore(80, 50), 68);
  assert.equal(computeOverallScore(null, 50), 50);
  assert.equal(computeOverallScore(70, null), 70);
  assert.equal(computeOverallScore(null, null), null);
});
