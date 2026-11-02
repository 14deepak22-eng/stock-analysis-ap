import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeAndStore } from "@/lib/stockPipeline";

// Long-running job: allow up to 5 minutes where the host supports it
// (Vercel reads this; other hosts ignore it).
export const maxDuration = 300;

// This route is triggered once a day (GitHub Actions / Vercel Cron). It
// refreshes every stock already tracked in the `stocks` table using the same
// pipeline as the on-demand stock page (lib/stockPipeline.js), so the two can
// never drift apart again. New stocks get added when a user searches them
// (see app/api/stock/[symbol]/route.js); the next cron run keeps them fresh.
//
// Optional: /api/cron/refresh?limit=20 refreshes at most 20 stocks per call -
// handy while the BharatStock free tier (50 requests/day) is the bottleneck.
export async function GET(request) {
  // Simple protection so random visitors can't trigger this manually
  // and burn through your daily API quota.
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit")) || Infinity;

  const { data: stocks, error } = await supabase.from("stocks").select("symbol");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  let rateLimited = false;

  for (const stock of stocks.slice(0, limit)) {
    if (rateLimited) {
      results.push({ symbol: stock.symbol, status: "skipped", message: "data provider rate limit reached" });
      continue;
    }
    try {
      await analyzeAndStore(stock.symbol, { replaceToday: true });
      results.push({ symbol: stock.symbol, status: "ok" });
    } catch (err) {
      // One stock failing shouldn't stop the whole job...
      results.push({ symbol: stock.symbol, status: "error", message: err.message });
      // ...except when the data provider says we're out of quota: every
      // remaining call would fail the same way, so stop spending requests.
      if (err.message.includes("(429)")) rateLimited = true;
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  return NextResponse.json({
    total: results.length,
    refreshed: ok,
    failed: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  });
}
