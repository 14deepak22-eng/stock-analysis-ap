// Pure helpers for the candlestick chart: timestamps, indicators, view ranges
// and the maths behind the bottom navigator. No React and no chart library in
// here, so all of it is unit tested (tests/chartUtils.test.mjs).

// Extra empty bars shown to the right of the latest candle, and the smallest
// number of bars the chart may be zoomed in to.
export const RIGHT_PAD = 6;
export const MIN_VISIBLE_BARS = 8;
export const DEFAULT_VISIBLE_BARS = 130;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_SECONDS = 19800;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
// Number(null) is 0 and Number("") is 0 - a missing price must not become a 0 candle.
const toNum = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ----- Timestamps ------------------------------------------------------

/**
 * Converts an Angel One candle time ("2026-11-02T09:15:00+05:30") into the
 * number the chart library wants.
 *
 * The chart draws every timestamp as if it were UTC. The old code passed the
 * real UTC instant, so a 09:15 IST candle was labelled 03:45, and a daily
 * candle (00:00 IST) was labelled with the PREVIOUS day. The fix is to take
 * the exchange's wall-clock reading (what Angel One printed) and use it as the
 * timestamp, so the axis shows exactly the market-local time.
 */
export function toChartTime(dateStr) {
  if (typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
    const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000;
    return Number.isFinite(t) ? t : null;
  }
  const parsed = Date.parse(dateStr);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) + IST_OFFSET_SECONDS : null;
}

/** "02 Nov 09:15" for intraday bars, "02 Nov 2026" for daily bars. */
export function formatChartTime(ts, withTime = false) {
  if (!isNum(ts)) return "";
  const d = new Date(ts * 1000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const base = `${day} ${MONTHS[d.getUTCMonth()]}`;
  if (withTime) {
    return `${base} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  return `${base} ${d.getUTCFullYear()}`;
}

/**
 * Raw candle rows -> clean bars: valid numbers only, oldest first, one bar per
 * timestamp. The chart library throws (and draws nothing at all) on unsorted or
 * duplicated times, so one bad row from the data source can't be allowed
 * through.
 */
export function prepareBars(candles) {
  const byTime = new Map();
  for (const c of candles ?? []) {
    const time = toChartTime(c?.date);
    const open = toNum(c?.open);
    const high = toNum(c?.high);
    const low = toNum(c?.low);
    const close = toNum(c?.close);
    if (time == null || ![open, high, low, close].every(isNum)) continue;
    byTime.set(time, {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: isNum(toNum(c.volume)) ? toNum(c.volume) : 0,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// ----- Indicators ------------------------------------------------------

/** Simple moving average; null until `period` values exist. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Wilder's RSI (the version charting platforms use); null until period+1 closes. */
export function rsiWilder(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const toRsi = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = toRsi();

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    out[i] = toRsi();
  }
  return out;
}

// ----- View ranges (logical bar indexes) --------------------------------

/** The range shown when data first loads: the latest bars, not a crushed "fit everything". */
export function defaultRange(n, visibleBars = DEFAULT_VISIBLE_BARS) {
  if (n <= 0) return null;
  return { from: Math.max(0, n - visibleBars), to: n - 1 + RIGHT_PAD };
}

/** Whole data set. */
export function fullRange(n) {
  if (n <= 0) return null;
  return { from: 0, to: n - 1 + RIGHT_PAD };
}

/**
 * Quick-range buttons. `preset` is { days } (calendar days back from the last
 * bar), { sessions } (last N trading days - for intraday charts) or { all: true }.
 */
export function presetRange(times, preset) {
  const n = times.length;
  if (n === 0) return null;
  if (preset.all) return fullRange(n);

  let startIdx = 0;
  if (preset.sessions) {
    const dayOf = (t) => Math.floor(t / 86400);
    let sessions = 0;
    let lastDay = null;
    startIdx = n - 1;
    for (let i = n - 1; i >= 0; i--) {
      const day = dayOf(times[i]);
      if (day !== lastDay) {
        sessions++;
        lastDay = day;
        if (sessions > preset.sessions) break;
      }
      startIdx = i;
    }
  } else if (preset.days) {
    const cutoff = times[n - 1] - preset.days * 86400;
    startIdx = times.findIndex((t) => t >= cutoff);
    if (startIdx < 0) startIdx = 0;
  }

  const to = n - 1 + RIGHT_PAD;
  const from = Math.min(startIdx, Math.max(0, n - MIN_VISIBLE_BARS));
  return { from, to };
}

/** Which quick-range buttons make sense for a chart interval. */
export function presetsForInterval(interval) {
  if (interval === "1min" || interval === "5min" || interval === "15min") {
    return [
      { label: "1D", sessions: 1 },
      { label: "3D", sessions: 3 },
      { label: "5D", sessions: 5 },
      { label: "All", all: true },
    ];
  }
  if (interval === "1hr") {
    return [
      { label: "1W", days: 7 },
      { label: "1M", days: 30 },
      { label: "3M", days: 91 },
      { label: "All", all: true },
    ];
  }
  return [
    { label: "1M", days: 30 },
    { label: "3M", days: 91 },
    { label: "6M", days: 182 },
    { label: "1Y", days: 365 },
    { label: "All", all: true },
  ];
}

export function isIntradayInterval(interval) {
  return interval === "1min" || interval === "5min" || interval === "15min" || interval === "1hr";
}

// ----- Navigator maths -------------------------------------------------

/**
 * Applies a drag on the bottom navigator to a visible range.
 *   mode "move":  slide the whole window by `delta` bars (width unchanged)
 *   mode "left":  move the left edge (zoom in/out from the left)
 *   mode "right": move the right edge
 * `n` is the number of bars. The window is kept inside the data (plus the
 * right-hand padding) and never narrower than MIN_VISIBLE_BARS.
 */
export function dragRange(mode, start, delta, n, { pad = RIGHT_PAD, minWidth = MIN_VISIBLE_BARS } = {}) {
  const maxTo = n - 1 + pad;
  const minW = Math.min(minWidth, Math.max(1, maxTo));
  let { from, to } = start;

  if (mode === "move") {
    const width = to - from;
    from = clamp(from + delta, 0, Math.max(0, maxTo - width));
    to = from + width;
  } else if (mode === "left") {
    from = clamp(from + delta, 0, to - minW);
  } else if (mode === "right") {
    to = clamp(to + delta, from + minW, maxTo);
  }
  return { from, to };
}

/** Re-centres a window of the same width on bar index `center`. */
export function centerRange(center, range, n, opts) {
  const width = range.to - range.from;
  return dragRange("move", { from: center - width / 2, to: center + width / 2 }, 0, n, opts);
}

/** Zooms a window around its centre; factor < 1 zooms in, > 1 zooms out. */
export function zoomRange(range, factor, n, { pad = RIGHT_PAD, minWidth = MIN_VISIBLE_BARS } = {}) {
  const maxTo = n - 1 + pad;
  const centre = (range.from + range.to) / 2;
  const width = clamp((range.to - range.from) * factor, Math.min(minWidth, maxTo), maxTo);
  let from = centre - width / 2;
  let to = centre + width / 2;
  if (from < 0) {
    to -= from;
    from = 0;
  }
  if (to > maxTo) {
    from -= to - maxTo;
    to = maxTo;
  }
  return { from: Math.max(0, from), to };
}

/** A small down-sampled path for the navigator's mini price line. */
export function sparkPoints(values, maxPoints = 240) {
  const n = values.length;
  if (n === 0) return [];
  const step = Math.max(1, Math.ceil(n / maxPoints));
  const picked = [];
  for (let i = 0; i < n; i += step) picked.push([i, values[i]]);
  if (picked[picked.length - 1][0] !== n - 1) picked.push([n - 1, values[n - 1]]);
  return picked;
}
