import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emaSeries, rsiSeries, computeRSI, computeMACD, buildTechnicalSignals,
  buildPriceHistory, DAILY_LOOKBACK_DAYS,
} from "../lib/technicals.js";

const candlesFrom = (closes) => ({
  data: closes.map((c, i) => [`2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00+05:30`, c, c, c, c, 1000 + i]),
});
const ramp = (n, start, step) => Array.from({ length: n }, (_, i) => start + i * step);

test("emaSeries seeds with the simple average and is null before that", () => {
  const e = emaSeries([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  assert.equal(e[2], 2); // mean of 1,2,3
  assert.equal(e[3], 3); // 4 * 0.5 + 2 * 0.5
  assert.equal(e[4], 4);
});

test("RSI matches the published Wilder worked example", () => {
  // Classic textbook closes (StockCharts RSI example). First RSI = 70.53, then 66.32, 66.55, 69.41.
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  const r = rsiSeries(closes, 14);
  assert.ok(Math.abs(r[14] - 70.53) < 0.1, `r[14]=${r[14]}`);
  assert.ok(Math.abs(r[15] - 66.32) < 0.1, `r[15]=${r[15]}`);
  assert.ok(Math.abs(r[16] - 66.55) < 0.1, `r[16]=${r[16]}`);
  assert.ok(Math.abs(r[17] - 69.41) < 0.1, `r[17]=${r[17]}`);
});

test("RSI is 100 for a pure uptrend, ~0 for a pure downtrend, null with too little data", () => {
  assert.equal(computeRSI(ramp(40, 100, 1)), 100);
  assert.ok(computeRSI(ramp(40, 200, -1)) < 1);
  assert.equal(computeRSI([1, 2, 3]), null);
});

test("MACD is NOT stuck at zero any more, and has the right sign", () => {
  const up = computeMACD(ramp(120, 100, 1));
  const down = computeMACD(ramp(120, 300, -1));
  assert.ok(up.macdLine > 0, "uptrend should have positive MACD");
  assert.ok(down.macdLine < 0, "downtrend should have negative MACD");
  assert.notEqual(up.macdSignal, up.macdLine * 0.9, "signal must be a real 9-EMA, not 0.9x the line");
  assert.equal(Math.round((up.macdHistogram - (up.macdLine - up.macdSignal)) * 1e9), 0);
});

test("MACD on a flat series is ~0 and needs at least 34 closes", () => {
  const flat = computeMACD(new Array(80).fill(50));
  assert.ok(Math.abs(flat.macdLine) < 1e-9 && Math.abs(flat.macdSignal) < 1e-9);
  assert.equal(computeMACD(ramp(33, 1, 1)).macdLine, null);
  assert.notEqual(computeMACD(ramp(34, 1, 1)).macdLine, null);
});

test("moving averages are only reported when there is enough history", () => {
  const short = buildTechnicalSignals(candlesFrom(ramp(150, 100, 1)));
  assert.notEqual(short.ma50, null);
  assert.equal(short.ma200, null, "150 candles can't make a 200-day average");
  const long = buildTechnicalSignals(candlesFrom(ramp(250, 100, 1)));
  assert.notEqual(long.ma200, null);
  // average of the last 200 closes: 100+50 .. 100+249 -> mean 249.5 - 100 ... compute directly
  const expected = ramp(250, 100, 1).slice(-200).reduce((a, b) => a + b, 0) / 200;
  assert.equal(long.ma200, expected);
});

test("price history draws MA200 once 200+ candles exist", () => {
  const hist = buildPriceHistory(candlesFrom(ramp(260, 100, 1)));
  assert.equal(hist.length, 150);
  assert.notEqual(hist.at(-1).ma200, null);
});

test("empty / malformed candle data doesn't throw", () => {
  const s = buildTechnicalSignals({ data: [] });
  assert.equal(s.price, null);
  assert.equal(s.rsi, null);
  assert.equal(s.macdLine, null);
  assert.doesNotThrow(() => buildTechnicalSignals(undefined));
  assert.doesNotThrow(() => buildTechnicalSignals({ data: [[null, null, null, null, null, null]] }));
});

test("lookback window is long enough for 200 trading sessions", () => {
  assert.ok(DAILY_LOOKBACK_DAYS * (5 / 7) * (245 / 260) >= 200);
});
