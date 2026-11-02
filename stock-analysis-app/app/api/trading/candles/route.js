import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSymbolToken, getHistoricalCandles } from "@/lib/dataSources/smartapi";
import { formatForSmartApi, formatCandlesForChart, INTERVAL_OPTIONS } from "@/lib/technicals";

// How far back each interval reaches. Longer than the defaults in
// INTERVAL_OPTIONS so the chart's navigator has real history to scroll
// through (all within Angel One's per-request limits: 1-min 30 days,
// 5-min 100, 15-min 200, 1-hour 400, daily 2000).
const LOOKBACK_DAYS = {
  "1min": 7,
  "5min": 30,
  "15min": 60,
  "1hr": 180,
  "1day": 730,
};

// Short in-memory cache so several people (or several tabs, or the page
// re-rendering) don't each trigger an Angel One call for the same chart -
// Angel One rate-limits historical data to about 3 requests a second.
const CACHE_TTL_MS = {
  "1min": 30 * 1000,
  "5min": 45 * 1000,
  "15min": 90 * 1000,
  "1hr": 5 * 60 * 1000,
  "1day": 10 * 60 * 1000,
};
const MAX_CACHE_ENTRIES = 200;
const cache = new Map(); // key -> { at, payload }
const inFlight = new Map(); // key -> Promise (identical requests share one fetch)

async function resolveToken(symbol) {
  // The curated `instruments` table already stores each stock's token, so
  // most lookups never need Angel One's big instrument file at all.
  try {
    const { data } = await supabase
      .from("instruments")
      .select("smartapi_token")
      .eq("symbol", symbol)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.smartapi_token) return data.smartapi_token;
  } catch {
    // fall through to the instrument file
  }
  const { token } = await getSymbolToken(symbol);
  return token;
}

async function fetchCandles(symbol, intervalKey, config) {
  const token = await resolveToken(symbol);
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (LOOKBACK_DAYS[intervalKey] ?? config.lookbackDays));

  const candleData = await getHistoricalCandles(
    token,
    formatForSmartApi(fromDate),
    formatForSmartApi(toDate),
    config.apiValue
  );

  // Angel One reports problems inside a 200 response ({status:false, message}).
  // Don't let that look like "no candles".
  if (candleData?.status === false) {
    throw new Error(candleData.message || "Angel One returned no candle data");
  }

  return { candles: formatCandlesForChart(candleData), interval: intervalKey, asOf: new Date().toISOString() };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const intervalKey = searchParams.get("interval") || "1day";

  const config = INTERVAL_OPTIONS[intervalKey];
  if (!symbol || !/^[A-Z0-9&-]{1,20}$/.test(symbol) || !config) {
    return NextResponse.json({ error: "Invalid symbol or interval" }, { status: 400 });
  }

  const key = `${symbol}|${intervalKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (CACHE_TTL_MS[intervalKey] ?? 60000)) {
    return NextResponse.json({ ...hit.payload, cached: true });
  }

  try {
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        fetchCandles(symbol, intervalKey, config).finally(() => inFlight.delete(key))
      );
    }
    const payload = await inFlight.get(key);

    if (payload.candles.length > 0) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value); // drop the oldest
      cache.set(key, { at: Date.now(), payload });
    }
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    console.log("CANDLES FETCH FAILED:", symbol, intervalKey, err.message);
    // If Angel One is having a bad moment, an older copy is better than a blank chart.
    if (hit) return NextResponse.json({ ...hit.payload, cached: true, stale: true });
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
