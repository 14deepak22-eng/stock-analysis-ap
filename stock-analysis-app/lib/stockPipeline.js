// The single place that turns "a stock symbol" into saved scores + analysis.
//
// Used by BOTH the on-demand route (/api/stock/[symbol]) and the daily
// refresh cron (/api/cron/refresh). Before this existed the cron had its own
// older copy of the logic that had drifted: it imported AI functions that no
// longer exist, read a symbol_token that was never saved, skipped the sector
// statistics (so every investment metric scored a flat 50) and carried its
// own buggy copies of the indicator maths.

import { supabase } from "@/lib/supabase";
import {
  computeInvestmentScoreDetailed,
  computeTradingScoreDetailed,
  computeOverallScore,
} from "@/lib/scoring";
import { buildSectorStats, flattenSectorStats } from "@/lib/sectorStats";
import { explainAll } from "@/lib/ai/explain";
import { getStockOverview, getSectorPeers } from "@/lib/dataSources/bharatstock";
import { getHistoricalCandles, getSymbolToken } from "@/lib/dataSources/smartapi";
import { getRecentHeadlines } from "@/lib/dataSources/news";
import {
  buildTechnicalSignals,
  buildPriceHistory,
  formatForSmartApi,
  DAILY_LOOKBACK_DAYS,
} from "@/lib/technicals";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTechnicals(symbol) {
  try {
    const { token } = await getSymbolToken(symbol);
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - DAILY_LOOKBACK_DAYS);
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
    console.log("TECHNICAL SCORE FAILED:", symbol, techErr.message);
    return { signals: null, priceHistory: [] };
  }
}

/**
 * Fetches fresh data for one stock, scores it, asks the AI to explain it and
 * saves everything. Returns { score, analysis } in the same shape the stock
 * page already expects.
 *
 * replaceToday: delete today's existing rows for this stock first (used for
 * manual "Refresh data" clicks and the daily cron so a stock never ends up
 * with two rows for the same day). The delete only happens after the new
 * data has been fetched and scored, so a failed fetch never wipes good data.
 */
export async function analyzeAndStore(symbol, { replaceToday = false } = {}) {
  const overview = await getStockOverview(symbol);

  // These two don't depend on each other - run them at the same time.
  const [peers, technicalResult] = await Promise.all([
    getSectorPeers(overview.sector),
    fetchTechnicals(symbol),
  ]);

  // Fundamentals + robust sector stats -> Investment score
  const sectorStats = buildSectorStats(peers?.data ?? []);
  const investment = computeInvestmentScoreDetailed(overview.metrics, sectorStats);
  const fundamentals = {
    ...overview.metrics,
    ...flattenSectorStats(sectorStats),
    // Lets the AI (and the page) say how much of the score rests on real data.
    investment_data_coverage_pct: Math.round(investment.coverage * 100),
  };

  // Technicals -> Trading score
  const { signals, priceHistory } = technicalResult;
  const trading = signals ? computeTradingScoreDetailed(signals) : null;
  const investmentScore = investment.score;
  const tradingScore = trading ? trading.score : 50;

  await supabase.from("stocks").upsert({
    symbol,
    company_name: overview.company_name,
    sector: overview.sector,
    exchange: overview.exchange,
  });

  if (replaceToday) {
    await supabase.from("stock_scores").delete().eq("symbol", symbol).eq("score_date", todayISO());
    await supabase.from("stock_analysis").delete().eq("symbol", symbol).eq("analysis_date", todayISO());
  }

  const scoreRow = {
    symbol,
    score_date: todayISO(),
    investment_score: investmentScore,
    trading_score: tradingScore,
    overall_score: computeOverallScore(investmentScore, tradingScore),
  };
  const { error: scoreInsertError } = await supabase.from("stock_scores").insert(scoreRow);
  if (scoreInsertError) {
    console.log("STOCK_SCORES INSERT FAILED:", symbol, JSON.stringify(scoreInsertError));
  }

  // One combined AI call (investment, trading, news, verdict).
  const headlines = await getRecentHeadlines(overview.company_name);
  const combined = await explainAll({
    symbol,
    investmentScore,
    fundamentals,
    tradingScore,
    signals,
    headlines,
  });

  const analysisRow = {
    symbol,
    analysis_date: todayISO(),
    investment_analysis: combined.investment_analysis,
    trading_analysis: combined.trading_analysis,
    news_analysis: combined.news_analysis,
    verdict: combined.verdict,
    raw_metrics: {
      ...fundamentals,
      ...signals,
      investment_data_coverage_pct: Math.round(investment.coverage * 100),
      trading_data_coverage_pct: trading ? Math.round(trading.coverage * 100) : 0,
      technicals_available: Boolean(signals),
      price_history: priceHistory,
    },
  };
  const { error: analysisInsertError } = await supabase.from("stock_analysis").insert(analysisRow);
  if (analysisInsertError) {
    console.log("STOCK_ANALYSIS INSERT FAILED:", symbol, JSON.stringify(analysisInsertError));
  }

  return { score: scoreRow, analysis: analysisRow };
}
