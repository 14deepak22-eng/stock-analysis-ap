import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeInvestmentScore, computeTradingScore, computeOverallScore } from "@/lib/scoring";
import { explainScore, explainNewsSentiment, explainVerdict } from "@/lib/ai/explain";
import { getStockOverview, getSectorPeers } from "@/lib/dataSources/bharatstock";
import { getHistoricalCandles, getSymbolToken } from "@/lib/dataSources/smartapi";
import { getRecentHeadlines } from "@/lib/dataSources/news";
import { buildTechnicalSignals, buildPriceHistory, formatForSmartApi } from "@/lib/technicals";

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
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingScore) {
      const { data: analysis } = await supabase
        .from("stock_analysis")
        .select("*")
        .eq("symbol", symbol)
        .order("analysis_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({ score: existingScore, analysis, cached: true });
    }
  }

    try {
    const overview = await getStockOverview(symbol);

    // These two don't depend on each other - run them at the same time
    // instead of waiting for one before starting the other.
    const [peers, technicalResult] = await Promise.all([
      getSectorPeers(overview.sector),
      (async () => {
        try {
          const { token } = await getSymbolToken(symbol);
          const toDate = new Date();
          const fromDate = new Date();
          fromDate.setDate(fromDate.getDate() - 220);
          const candleData = await getHistoricalCandles(
            token,
            formatForSmartApi(fromDate),
            formatForSmartApi(toDate)
          );
          return {
            signals: buildTechnicalSignals(candleData),
            priceHistory: buildPriceHistory(candleData),
          };
        } catch (techErr) {
          console.log("TECHNICAL SCORE FAILED:", techErr.message);
          return { signals: null, priceHistory: [] };
        }
      })(),
    ]);

    const fundamentals = buildFundamentalsWithSectorStats(overview, peers);
    const investmentScore = computeInvestmentScore(fundamentals);
    const { signals, priceHistory } = technicalResult;
    const tradingScore = signals ? computeTradingScore(signals) : 50;

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
      overall_score: computeOverallScore(investmentScore, tradingScore),
    };
    await supabase.from("stock_scores").insert(scoreRow);

    // These three AI/news calls are all independent - run them together
    // instead of one after another. This is the biggest time saver.
    const [investmentAnalysis, tradingAnalysis, newsAnalysis] = await Promise.all([
      explainScore(symbol, "Investment", investmentScore, fundamentals),
      signals ? explainScore(symbol, "Trading", tradingScore, signals) : Promise.resolve(null),
      getRecentHeadlines(overview.company_name).then((headlines) =>
        explainNewsSentiment(overview.company_name, headlines)
      ),
    ]);

    // Verdict needs the other three results, so it runs last.
    const verdict = await explainVerdict(
      symbol,
      investmentScore,
      tradingScore,
      newsAnalysis?.sentiment ?? "Unknown"
    );

    const analysisRow = {
      symbol,
      analysis_date: today(),
      investment_analysis: investmentAnalysis,
      trading_analysis: tradingAnalysis,
      news_analysis: newsAnalysis,
      verdict,
      raw_metrics: { ...fundamentals, ...signals, price_history: priceHistory },
    };
    await supabase.from("stock_analysis").insert(analysisRow);

    return NextResponse.json({ score: scoreRow, analysis: analysisRow, cached: false });
  } catch (err) {
    console.log("STOCK ROUTE FAILED:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildFundamentalsWithSectorStats(overview, peers) {
  const metrics = [
    "pe_ratio", "peg_ratio", "roe", "roce", "debt_to_equity",
    "revenue_growth_yoy", "net_margin", "promoter_holding",
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
