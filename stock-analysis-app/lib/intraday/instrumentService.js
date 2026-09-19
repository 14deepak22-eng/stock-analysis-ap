// Manages the controlled stock universe for intraday scanning - a
// curated list of ~liquid NSE stocks, stored in the `instruments` table
// rather than re-parsing SmartAPI's full instrument file on every request.

import { supabase } from "@/lib/supabase";
import { stockList } from "@/lib/stockList"; // your existing curated ~220-stock list
import { getSymbolToken } from "@/lib/dataSources/smartapi";

/**
 * Ensures the `instruments` table is populated from your existing
 * curated stock list. Safe to call repeatedly - upserts, doesn't duplicate.
 * This is a one-time/occasional sync, not run on every request.
 */
export async function syncInstrumentUniverse() {
  let synced = 0;
  let failed = 0;

  for (const stock of stockList) {
    try {
      const { token, tradingSymbol } = await getSymbolToken(stock.symbol);
      const { error } = await supabase.from("instruments").upsert(
        {
          symbol: stock.symbol,
          exchange: "NSE",
          trading_symbol: tradingSymbol,
          smartapi_token: token,
          company_name: stock.name,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trading_symbol,exchange" }
      );
      if (error) {
        console.log(`INSTRUMENT SYNC FAILED for ${stock.symbol}:`, JSON.stringify(error));
        failed++;
      } else {
        synced++;
      }
    } catch (err) {
      console.log(`INSTRUMENT SYNC lookup failed for ${stock.symbol}:`, err.message);
      failed++;
    }
  }

  return { synced, failed, total: stockList.length };
}

/**
 * Returns the active instrument universe for scanning - reads from the
 * database, not SmartAPI, so this is fast and free.
 */
export async function getActiveInstruments() {
  const { data, error } = await supabase
    .from("instruments")
    .select("*")
    .eq("is_active", true);

  if (error) {
    console.log("GET ACTIVE INSTRUMENTS FAILED:", JSON.stringify(error));
    return [];
  }
  return data || [];
}
