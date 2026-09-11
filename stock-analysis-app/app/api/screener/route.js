import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/screener?minInvestment=70&minTrading=0&sort=investment
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minInvestment = Number(searchParams.get("minInvestment") ?? 0);
  const minTrading = Number(searchParams.get("minTrading") ?? 0);
  const sort = searchParams.get("sort") ?? "investment";

  const sortColumn = sort === "trading" ? "trading_score" : "investment_score";

  // No date filter - shows every stock you've ever fetched, using
  // whatever the latest saved score is for each one (matches the
  // "cache until manual refresh" behavior on the stock page).
  const { data, error } = await supabase
    .from("stock_scores")
    .select("symbol, investment_score, trading_score, score_date, stocks(company_name, sector)")
    .gte("investment_score", minInvestment)
    .gte("trading_score", minTrading)
    .order(sortColumn, { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If a stock was fetched more than once, keep only its most recent row.
  const latestBySymbol = new Map();
  for (const row of data) {
    const existing = latestBySymbol.get(row.symbol);
    if (!existing || row.score_date > existing.score_date) {
      latestBySymbol.set(row.symbol, row);
    }
  }

  return NextResponse.json({ stocks: Array.from(latestBySymbol.values()) });
}
