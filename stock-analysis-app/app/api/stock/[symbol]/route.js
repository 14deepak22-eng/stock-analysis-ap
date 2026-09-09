import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeInvestmentScore } from "@/lib/scoring";
import { explainScore, explainNewsSentiment } from "@/lib/ai/explain";
import { getStockOverview, getSectorPeers } from "@/lib/dataSources/bharatstock";
import { getRecentHeadlines } from "@/lib/dataSources/news";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request, { params }) {
  const symbol = params.symbol.toUpperCase();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  if (!forceRefresh) {
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
  }

  try {
    const overview = await getStockOverview(symbol);
    const peers = await getSectorPeers(overview.sector);
    const fundamentals = buildFundamentalsWithSectorStats(overview, peers);
    const investmentScore = computeInvestmentScore(fundamentals);
    const tradingScore = 50; // filled in by the daily cron job once implemented

    await supabase.from("stocks").upsert({
      symbol,
      company_name: overview.company_name,
      sector: overview.sector,
      exchange: overview.exchange,
    });

    if (forceRefresh) {
      await supabase.from("stock_scores").delete().eq("symbol", symbol).eq("score_date", today());
      await supabase.from("stock_analysis").delete().eq("symbol", symbol).eq("analysis_date", today());
    }

    const scoreRow = {
      symbol,
      score_date: today(),
      investment_score: investmentScore,
      trading_score: tradingScore,
    };
    await supabase.from("stock_scores").insert(scoreRow);

    const investmentAnalysis = await explainScore(symbol, "Investment", investmentScore, fundamentals);
    const headlines = await getRecentHeadlines(overview.company_name);
    const newsAnalysis = await explainNewsSentiment(overview.company_name, headlines);

    const analysisRow = {
      symbol,
      analysis_date: today(),
      investment_analysis: investmentAnalysis,
      trading_analysis: null,
      news_analysis: newsAnalysis,
      raw_metrics: fundamentals,
    };
    await supabase.from("stock_analysis").insert(analysisRow);

    return NextResponse.json({ score: scoreRow, analysis: analysisRow, cached: false });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildFundamentalsWithSectorStats(overview, peers) {
  const metrics = [
    "pe_ratio",
    "peg_ratio",
    "roe",
    "roce",
    "debt_to_equity",
    "revenue_growth_yoy",
    "net_margin",
    "promoter_holding",
  ];

  const result = { ...overview.metrics };
  for (const metric of metrics) {
    const values = (peers.data || [])
      .map((p) => p[metric])
      .filter((v) => typeof v === "number");
    if (values.length > 0) {
      const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      result[`sector_${metric}_median`] = median;
      result[`sector_${metric}_std`] = Math.sqrt(variance);
    }
  }
  return result;
}
