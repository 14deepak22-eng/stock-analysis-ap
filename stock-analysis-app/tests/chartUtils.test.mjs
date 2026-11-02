import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toChartTime, formatChartTime, prepareBars, sma, rsiWilder, defaultRange, fullRange,
  presetRange, presetsForInterval, dragRange, centerRange, zoomRange, sparkPoints,
  RIGHT_PAD, MIN_VISIBLE_BARS,
} from "../lib/chartUtils.js";

test("timestamps keep the exchange's wall-clock time (the old code showed 03:45 and the wrong day)", () => {
  const intraday = toChartTime("2026-11-02T09:15:00+05:30");
  assert.equal(formatChartTime(intraday, true), "02 Nov 09:15");
  const daily = toChartTime("2026-11-02T00:00:00+05:30");
  assert.equal(formatChartTime(daily, false), "02 Nov 2026");
  assert.equal(toChartTime("2026-11-02 15:29") - toChartTime("2026-11-02 09:15"), (6 * 60 + 14) * 60);
  assert.equal(toChartTime("not a date"), null);
  assert.equal(toChartTime(undefined), null);
});

test("prepareBars sorts, de-duplicates and drops bad rows (duplicates make the chart library throw)", () => {
  const rows = [
    { date: "2026-11-03T00:00:00+05:30", open: 12, high: 13, low: 11, close: 12.5, volume: 10 },
    { date: "2026-11-02T00:00:00+05:30", open: 10, high: 11, low: 9, close: 10.5, volume: 5 },
    { date: "2026-11-02T00:00:00+05:30", open: 10, high: 11.5, low: 9, close: 11, volume: 7 }, // duplicate time
    { date: "garbage", open: 1, high: 1, low: 1, close: 1 },
    { date: "2026-11-04T00:00:00+05:30", open: null, high: 1, low: 1, close: 1 }, // missing price must NOT become a 0 candle
    { date: "2026-11-06T00:00:00+05:30", open: "", high: 1, low: 1, close: 1 },
    { date: "2026-11-05T00:00:00+05:30", open: "x", high: 1, low: 1, close: 1 },
  ];
  const bars = prepareBars(rows);
  assert.equal(bars.length, 2);
  assert.ok(bars[0].time < bars[1].time);
  assert.equal(bars[0].volume, 7, "later duplicate wins");
  assert.deepEqual(prepareBars(undefined), []);
});

test("prepareBars repairs a high/low that doesn't contain open and close", () => {
  const [b] = prepareBars([{ date: "2026-11-02", open: 10, high: 9, low: 11, close: 12, volume: 1 }]);
  assert.equal(b.high, 12);
  assert.equal(b.low, 10);
});

test("sma matches a hand calculation and is null until it has enough values", () => {
  const out = sma([1, 2, 3, 4, 5, 6], 3);
  assert.deepEqual(out, [null, null, 2, 3, 4, 5]);
  assert.deepEqual(sma([1, 2], 5), [null, null]);
});

test("Wilder RSI matches the published worked example", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  const r = rsiWilder(closes, 14);
  assert.ok(Math.abs(r[14] - 70.53) < 0.1);
  assert.ok(Math.abs(r[17] - 69.41) < 0.1);
  assert.equal(r[13], null);
  assert.equal(rsiWilder(Array.from({ length: 30 }, (_, i) => i), 14).at(-1), 100);
  assert.equal(rsiWilder(new Array(30).fill(5), 14).at(-1), 50);
});

test("default view shows the latest bars with right padding, not everything crushed together", () => {
  assert.deepEqual(defaultRange(1000, 130), { from: 870, to: 999 + RIGHT_PAD });
  assert.deepEqual(defaultRange(50, 130), { from: 0, to: 49 + RIGHT_PAD });
  assert.equal(defaultRange(0), null);
  assert.deepEqual(fullRange(10), { from: 0, to: 9 + RIGHT_PAD });
});

// five trading days of 5-minute bars (75 per session), IST wall-clock times
function sessionTimes(days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const base = toChartTime(`2026-10-${String(26 + d).padStart(2, "0")}T09:15:00+05:30`);
    for (let i = 0; i < 75; i++) out.push(base + i * 300);
  }
  return out;
}

test("quick ranges: 1D / 3D count trading sessions, days-based ranges use calendar time", () => {
  const times = sessionTimes(5); // 375 bars
  assert.equal(presetRange(times, { sessions: 1 }).from, 300);
  assert.equal(presetRange(times, { sessions: 3 }).from, 150);
  assert.equal(presetRange(times, { sessions: 5 }).from, 0);
  assert.equal(presetRange(times, { sessions: 9 }).from, 0);
  assert.deepEqual(presetRange(times, { all: true }), fullRange(375));
  const daily = Array.from({ length: 300 }, (_, i) => toChartTime("2025-01-01") + i * 86400);
  assert.equal(presetRange(daily, { days: 30 }).from, 299 - 30);
  assert.equal(presetRange([], { all: true }), null);
  assert.ok(presetsForInterval("5min").some((p) => p.sessions === 1));
  assert.ok(presetsForInterval("1day").some((p) => p.days === 365));
});

test("navigator: dragging the window moves it without changing its width, and stays inside the data", () => {
  const n = 500;
  const start = { from: 100, to: 230 };
  const moved = dragRange("move", start, 50, n);
  assert.deepEqual(moved, { from: 150, to: 280 });
  const farLeft = dragRange("move", start, -9999, n);
  assert.equal(farLeft.from, 0);
  assert.equal(farLeft.to - farLeft.from, 130);
  const farRight = dragRange("move", start, 9999, n);
  assert.equal(farRight.to, n - 1 + RIGHT_PAD);
  assert.equal(farRight.to - farRight.from, 130);
});

test("navigator: dragging an edge zooms, never below the minimum width, never past the data", () => {
  const n = 500;
  const start = { from: 100, to: 230 };
  assert.deepEqual(dragRange("left", start, -40, n), { from: 60, to: 230 });
  assert.equal(dragRange("left", start, -9999, n).from, 0);
  assert.equal(dragRange("left", start, 9999, n).from, 230 - MIN_VISIBLE_BARS);
  assert.deepEqual(dragRange("right", start, 20, n), { from: 100, to: 250 });
  assert.equal(dragRange("right", start, -9999, n).to, 100 + MIN_VISIBLE_BARS);
  assert.equal(dragRange("right", start, 9999, n).to, n - 1 + RIGHT_PAD);
});

test("navigator: clicking the bar re-centres the window; zoom keeps the centre and respects the limits", () => {
  const n = 500;
  const c = centerRange(250, { from: 0, to: 100 }, n);
  assert.equal(c.to - c.from, 100);
  assert.equal((c.from + c.to) / 2, 250);
  assert.equal(centerRange(5, { from: 300, to: 400 }, n).from, 0);

  const z = zoomRange({ from: 200, to: 300 }, 0.5, n);
  assert.equal(z.to - z.from, 50);
  assert.equal((z.from + z.to) / 2, 250);
  const out = zoomRange({ from: 200, to: 300 }, 100, n);
  assert.equal(out.from, 0);
  assert.equal(out.to, n - 1 + RIGHT_PAD);
  assert.ok(zoomRange({ from: 200, to: 210 }, 0.01, n).to - zoomRange({ from: 200, to: 210 }, 0.01, n).from >= MIN_VISIBLE_BARS);
});

test("sparkline is down-sampled but always keeps the last point", () => {
  const values = Array.from({ length: 5000 }, (_, i) => i);
  const pts = sparkPoints(values, 240);
  assert.ok(pts.length <= 242);
  assert.equal(pts.at(-1)[0], 4999);
  assert.deepEqual(sparkPoints([]), []);
  assert.equal(sparkPoints([7]).length, 1);
});
