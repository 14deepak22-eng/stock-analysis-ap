// Wrapper around the BharatStock API (bharatstockapi.com).
// Free tier: 50 requests/day, so callers should check the database
// for today's data before calling this.

const BASE_URL = "https://bharatstockapi.com/v1";

async function bharatstockRequest(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-API-Key": process.env.BHARATSTOCK_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`BharatStock request failed (${res.status}): ${path}`);
  }
  return res.json();
}

/**
 * Fetches company info + latest computed ratios for one symbol.
 * e.g. getStockOverview("RELIANCE")
 */
export async function getStockOverview(symbol) {
  return bharatstockRequest(`/stocks/${symbol}`);
}

/**
 * Fetches quarterly/annual P&L, balance sheet, cash flow for one symbol.
 */
export async function getFinancials(symbol) {
  return bharatstockRequest(`/stocks/${symbol}/financials`);
}

/**
 * Fetches sector peer list with the same metrics, used to compute
 * sector median/std for the Investment score's z-score normalization.
 * Cached in-memory per sector for 12 hours to avoid re-fetching the same
 * ~50-stock peer list on every search within a sector (e.g. multiple IT
 * stocks all share the same peer list).
 */
const sectorPeerCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export async function getSectorPeers(sector) {
  const cached = sectorPeerCache.get(sector);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await bharatstockRequest(`/screener?sector=${encodeURIComponent(sector)}`);
  sectorPeerCache.set(sector, { data, timestamp: Date.now() });
  return data;
}
