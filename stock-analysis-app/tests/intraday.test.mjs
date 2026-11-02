import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAvgDailyVolume, calculateRelativeVolumeByTimeOfDay, calculateAllIndicators,
} from "../lib/intraday/indicatorService.js";

const ts = (date, minutes) =>
  `${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+05:30`;
const candle = (date, minutes, volume, price = 100) => ({
  timestamp: ts(date, minutes), open: price, high: price, low: price, close: price, volume,
});
const SESSION_START = 9 * 60 + 15; // 09:15
const SESSION_END = 15 * 60 + 30; // 15:30

function fullDay15(date, volumePerCandle) {
  const out = [];
  for (let m = SESSION_START; m + 15 <= SESSION_END; m += 15) out.push(candle(date, m, volumePerCandle));
  return out;
}

const PRIOR_DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];

test("average daily volume divides by the days actually present (not a fixed 20)", () => {
  const c = [candle("2026-10-27", 600, 100), candle("2026-10-27", 615, 100), candle("2026-10-28", 600, 300)];
  assert.equal(calculateAvgDailyVolume(c), 250); // (200 + 300) / 2 days
  assert.equal(calculateAvgDailyVolume(c, "2026-10-28"), 200); // today excluded
  assert.equal(calculateAvgDailyVolume([]), null);
});

function scenario(todayVolPer5min, lastStartMinutes = 10 * 60 + 55) {
  const history = PRIOR_DAYS.flatMap((d) => fullDay15(d, 90));
  const today5 = [];
  for (let m = SESSION_START; m <= lastStartMinutes; m += 5) today5.push(candle("2026-11-02", m, todayVolPer5min));
  return { today5, history15: [...history, ...fullDay15("2026-11-02", 999)] };
}

test("relative volume is 1.0 when today tracks the usual pace at the same time of day", () => {
  // by 11:00: 21 five-minute candles x 30 = 630; prior days: 7 fifteen-minute candles x 90 = 630
  const { today5, history15 } = scenario(30);
  assert.equal(calculateRelativeVolumeByTimeOfDay(today5, history15), 1);
});

test("relative volume doubles when today trades double the usual pace", () => {
  const { today5, history15 } = scenario(60);
  assert.equal(calculateRelativeVolumeByTimeOfDay(today5, history15), 2);
});

test("a normal morning is no longer mistaken for a quiet day (the old full-day comparison would say ~0.2)", () => {
  const { today5, history15 } = scenario(30);
  const fullDayAvg = calculateAvgDailyVolume(history15, "2026-11-02");
  const oldStyle = today5.reduce((s, c) => s + c.volume, 0) / fullDayAvg;
  assert.ok(oldStyle < 0.4);
  assert.equal(calculateRelativeVolumeByTimeOfDay(today5, history15), 1);
});

test("returns null instead of guessing: market just opened, or too little history", () => {
  const { today5, history15 } = scenario(30, SESSION_START + 5); // only 2 candles so far
  assert.equal(calculateRelativeVolumeByTimeOfDay(today5, history15), null);
  const few = PRIOR_DAYS.slice(0, 2).flatMap((d) => fullDay15(d, 90));
  const { today5: t } = scenario(30);
  assert.equal(calculateRelativeVolumeByTimeOfDay(t, few), null);
});

test("calculateAllIndicators wires the time-of-day relative volume through", () => {
  const { today5, history15 } = scenario(30);
  const ind = calculateAllIndicators(today5, history15, calculateAvgDailyVolume(history15, "2026-11-02"));
  assert.equal(ind.relativeVolume, 1);
});
