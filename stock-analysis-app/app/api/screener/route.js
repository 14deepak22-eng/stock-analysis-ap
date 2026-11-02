import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/screener?minInvestment=70&minTrading=0&sort=investment
//   sort = investment (default) | trading | overall
//
// Every stock can have many saved score rows (one per day). The screener must
// compare each stock's LATEST row against the filters. The previous version
// applied the filters first and picked the latest row afterwards, so a stock
// whose old score passed the filter but whose newest score did not would still
// show up with the stale number. It also fetched a single page, so once the
// history grew past Supabase's 1000-row default the newest stocks could be cut
// off. Here: latest row per stock first, filter second, with paging.

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

async function fetchAllPages(makeQuery) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { rows };
}

// Preferred path: the latest_stock_scores view (see
// supabase/migrations/001_fix_pack.sql) - one row per stock, computed in SQL.
async function fromView() {
  const { rows, error } = await fetchAllPages(() =>
    supabase
      .from("latest_stock_scores")
      .select("symbol, investment_score, trading_score, overall_score, score_date, company_name, sector")
      .order("symbol", { ascending: true })
  );
  if (error) return { error };
  return {
    rows: rows.map((r) => ({
      symbol: r.symbol,
      investment_score: r.investment_score,
      trading_score: r.trading_score,
      overall_score: r.overall_score,
      score_date: r.score_date,
      stocks: { company_name: r.company_name, sector: r.sector },
    })),
  };
}

// Fallback if the view hasn't been created yet: page through every score row
// newest-first and keep the first row seen for each symbol.
async function fromTable() {
  const { rows, error } = await fetchAllPages(() =>
    supabase
      .from("stock_scores")
      .select("id, symbol, investment_score, trading_score, overall_score, score_date, stocks(company_name, sector)")
      .order("score_date", { ascending: false })
      .order("id", { ascending: false })
  );
  if (error) return { error };
  const latest = new Map();
  for (const row of rows) {
    if (!latest.has(row.symbol)) latest.set(row.symbol, row);
  }
  return { rows: [...latest.values()] };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minInvestment = Number(searchParams.get("minInvestment") ?? 0) || 0;
  const minTrading = Number(searchParams.get("minTrading") ?? 0) || 0;
  const sort = searchParams.get("sort") ?? "investment";
  const sortColumn =
    sort === "trading" ? "trading_score" : sort === "overall" ? "overall_score" : "investment_score";

  let result = await fromView();
  let source = "view";
  if (result.error) {
    result = await fromTable();
    source = "table";
  }
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const stocks = result.rows
    .filter((r) => (r.investment_score ?? 0) >= minInvestment && (r.trading_score ?? 0) >= minTrading)
    .sort((a, b) => (b[sortColumn] ?? -1) - (a[sortColumn] ?? -1));

  return NextResponse.json({ stocks, source });
}
