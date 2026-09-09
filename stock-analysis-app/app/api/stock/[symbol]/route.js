import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeInvestmentScore, computeTradingScore } from "@/lib/scoring";
import { explainScore, explainNewsSentiment } from "@/lib/ai/explain";
import { getStockOverview, getSectorPeers } from "@/lib/dataSources/bharatstock";
import { getRecentHeadlines } from "@/lib/dataSources/news";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request, { params }) {
  const symbol = params.symbol.toUpperCase();

  // 1. Check if we already have today's score cached - avoids wasting
  //    API calls on BharatStock's free 50/day limit.
  const { data: existingScore } = await supabase
    .from("stock_scores")
    .select("*")
    .eq("symbol", symbol)
    .eq("score_date", today())
    .maybeSingle();

  if (existingScore) {
    const { data: analysis } = await supabase
      .from("stock_analysis")
      .select("*")
      .eq("symbol", symbol)
      .eq("analysis_date", today())
      .maybeSingle();

    return NextResponse.json({ score: existingScore, analysis, cached: true });
  }

  // 2. No data for today yet - this is either the first time this stock
  //    has been searched, or the daily cron job hasn't run yet. Fetch
  //    fresh data now (on-demand refresh, as described in the project plan).
  try {
    const overview = await getStockOverview(symbol);
    const peers = await getSectorPeers(overview.sector);

    // Build the fundamentals object the scoring engine expects, including
    // sector median/std for z-score normalization.
    const fundamentals = buildFundamentalsWithSectorStats(overview, peers);
    const investmentScore = computeInvestmentScore(fundamentals);

    // NOTE: trading score needs technical signals from SmartAPI (candles,
    // RSI, MACD, moving averages). That fetch + calculation is wired up
    // in the daily cron job (app/api/cron/refresh/route.js) - for an
    // on-demand first-time lookup you'd call the same helper here.
    // Left as a placeholder score until that step is implemented.
    const tradingScore = 50;

    // Save the stock + score to the database
    await supabase.from("stocks").upsert({
      symbol,
      company_name: overview.company_name,
      sector: overview.sector,
      exchange: overview.exchange,
    });

    const scoreRow = {
      symbol,
      score_date: today(),
      investment_score: investmentScore,
      trading_score: tradingScore,
    };
    await supabase.from("stock_scores").insert(scoreRow);

    // 3. Generate AI explanations (only happens once per stock per day)
    const investmentAnalysis = await explainScore(
      symbol,
      "Investment",
      investmentScore,
      fundamentals
    );

    const headlines = await getRecentHeadlines(overview.company_name);
    const newsAnalysis = await explainNewsSentiment(overview.company_name, headlines);

    const analysisRow = {
      symbol,
      analysis_date: today(),
      investment_analysis: investmentAnalysis,
      trading_analysis: null, // filled in once trading score logic above is completed
      news_analysis: newsAnalysis,
    };
    await supabase.from("stock_analysis").insert(analysisRow);

    return NextResponse.json({ score: scoreRow, analysis: analysisRow, cached: false });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildFundamentalsWithSectorStats(overview, peers) {
  // Computes a simple median/std across sector peers for each metric.
  // BharatStock's screener response shape may differ slightly - adjust
  // field names here once you see a real response in development.
  const metrics = [
    "pe_ratio",
    "peg_ratio",
    "roe",
    "roce",
    "debt_to_equity",
    "revenue_growth_3y",
    "profit_margin",
    "promoter_holding",
  ];

  const result = { ...overview.metrics };
  for (const metric of metrics) {
    const values = (peers.stocks || [])
      .map((p) => p.metrics?.[metric])
      .filter((v) => typeof v === "number");
    if (values.length > 0) {
      const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      result[`sector_${metric}_median`] = median;
      result[`sector_${metric}_std`] = Math.sqrt(variance);
    }
  }
  return result;
}
