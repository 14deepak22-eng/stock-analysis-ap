// Sector statistics for the Investment score.
//
// The score compares each metric to how the stock's sector peers look.
// The old version used mean and standard deviation, which a single outlier
// (a PE of 900, a loss-making peer with a negative PE) can wreck, and it
// silently fell back to "standard deviation = 1" when there were no peers.
//
// This version uses the median and the median absolute deviation (MAD),
// which barely move when a few peers are extreme, drops values that make no
// sense for a metric (negative PE, negative debt-to-equity), and returns
// null when there are too few peers to say anything useful - the scorer then
// skips that metric instead of inventing a neutral score.

export const SECTOR_METRICS = [
  "pe_ratio",
  "peg_ratio",
  "roe",
  "roce",
  "debt_to_equity",
  "revenue_growth_yoy",
  "net_margin",
  "promoter_holding",
];

// Fewer peers than this and a median/spread is not meaningful.
export const MIN_PEERS = 5;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Per-metric filter for values that should not count as a peer data point.
const VALID_PEER_VALUE = {
  pe_ratio: (v) => v > 0, // negative PE = loss-making, not "cheap"
  peg_ratio: (v) => v > 0,
  debt_to_equity: (v) => v >= 0, // negative = negative equity, not "low debt"
};

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Robust centre and spread for one metric.
 * scale = 1.4826 * MAD (the MAD that matches a standard deviation for
 * normally distributed data), floored at a quarter of the plain standard
 * deviation so a cluster of near-identical peers can't make the scale
 * absurdly tiny.
 */
export function robustStats(values) {
  const clean = (values ?? []).filter(isNum);
  if (clean.length < MIN_PEERS) return null;

  const med = median(clean);
  const mad = median(clean.map((v) => Math.abs(v - med)));
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const std = Math.sqrt(clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length);

  const scale = Math.max(1.4826 * mad, 0.25 * std);
  if (!(scale > 0)) return null; // every peer identical - nothing to compare against

  return { median: med, scale, mean, std, n: clean.length };
}

/**
 * Builds { metric: {median, scale, mean, std, n} | null } from a list of
 * peer records (each peer an object with the same metric names).
 */
export function buildSectorStats(peers, metrics = SECTOR_METRICS) {
  const stats = {};
  for (const metric of metrics) {
    const valid = VALID_PEER_VALUE[metric] ?? (() => true);
    const values = (peers ?? [])
      .map((p) => p?.[metric])
      .filter(isNum)
      .filter(valid);
    stats[metric] = robustStats(values);
  }
  return stats;
}

/**
 * Flattens the stats into the sector_<metric>_median / _std / _scale keys the
 * UI (SectorComparison) already reads from raw_metrics.
 */
export function flattenSectorStats(stats) {
  const flat = {};
  for (const [metric, s] of Object.entries(stats ?? {})) {
    if (!s) continue;
    flat[`sector_${metric}_median`] = s.median;
    flat[`sector_${metric}_std`] = s.std;
    flat[`sector_${metric}_scale`] = s.scale;
  }
  return flat;
}
