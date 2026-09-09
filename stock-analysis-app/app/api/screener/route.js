import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/screener?minInvestment=70&minTrading=0&sort=investment
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minInvestment = Number(searchParams.get("minInvestment") ?? 0);
  const minTrading = Number(searchParams.get("minTrading") ?? 0);
  const sort = searchParams.get("sort") ?? "investment";

  const sortColumn = sort === "trading" ? "trading_score" : "investment_score";

  const { data, error } = await supabase
    .from("stock_scores")
    .select("symbol, investment_score, trading_score, stocks(company_name, sector)")
    .eq("score_date", today())
    .gte("investment_score", minInvestment)
    .gte("trading_score", minTrading)
    .order(sortColumn, { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stocks: data });
}
