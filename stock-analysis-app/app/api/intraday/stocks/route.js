import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minScore = Number(searchParams.get("minScore") || 0);
  const signalFilter = searchParams.get("signal"); // "bullish" | "bearish" | "neutral" | null
  const limitParam = Number(searchParams.get("limit") || 50);
  const search = searchParams.get("search");

  // Get the most recent calculated_at timestamp for intraday mode
  const { data: latestRow } = await supabase
    .from("intraday_scores")
    .select("calculated_at")
    .eq("mode", "intraday")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRow) {
    return NextResponse.json({ success: true, stocks: [], totalStocksScanned: 0, shortlistedStocks: 0, lastUpdated: null });
  }

  let query = supabase
    .from("intraday_scores")
    .select("*, instruments(symbol, company_name, exchange)")
    .eq("mode", "intraday")
    .eq("calculated_at", latestRow.calculated_at)
    .gte("score", minScore)
    .order("rank", { ascending: true })
    .limit(limitParam);

  if (signalFilter === "bullish") {
    query = query.in("signal", ["Strong Bullish Candidate", "Bullish Candidate"]);
  } else if (signalFilter === "bearish") {
    query = query.eq("signal", "Avoid / Low Score");
  } else if (signalFilter === "neutral") {
    query = query.eq("signal", "Neutral / Watchlist");
  }

  const { data, error } = await query;

  if (error) {
    console.log("INTRADAY STOCKS FETCH FAILED:", JSON.stringify(error));
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let filtered = data || [];
  if (search) {
    filtered = filtered.filter((s) => s.instruments?.symbol?.toUpperCase().includes(search.toUpperCase()));
  }

  const { count: totalScanned } = await supabase
    .from("intraday_scores")
    .select("*", { count: "exact", head: true })
    .eq("mode", "intraday")
    .eq("calculated_at", latestRow.calculated_at);

  return NextResponse.json({
    success: true,
    mode: "intraday",
    lastUpdated: latestRow.calculated_at,
    totalStocksScanned: totalScanned ?? 0,
    shortlistedStocks: filtered.length,
    stocks: filtered.map((s) => ({
      rank: s.rank,
      symbol: s.instruments?.symbol,
      companyName: s.instruments?.company_name,
      exchange: s.instruments?.exchange,
      currentPrice: s.current_price,
      priceChange: s.price_change,
      priceChangePercentage: s.price_change_percentage,
      score: s.score,
      signal: s.signal,
      trend: s.current_price != null && s.vwap != null ? (s.current_price > s.vwap ? "Above VWAP" : "Below VWAP") : "Unknown",
      volumeStatus: s.relative_volume == null ? "Unknown" : s.relative_volume >= 1.3 ? "High Relative Volume" : "Normal Volume",
      volatilityStatus: s.atr == null ? "Unknown" : "Calculated",
      liquidityStatus: s.liquidity_score >= 15 ? "High" : s.liquidity_score >= 8 ? "Moderate" : "Low",
      entryPrice: s.entry_price,
      stopLoss: s.stop_loss,
      targetPrice: s.target_price,
      riskRewardRatio: s.risk_reward_ratio,
      lastUpdated: s.calculated_at,
    })),
  });
}
