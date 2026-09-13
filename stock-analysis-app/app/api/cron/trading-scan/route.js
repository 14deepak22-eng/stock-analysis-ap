import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEquityBatch, getHistoricalCandles } from "@/lib/dataSources/smartapi";
import { buildTechnicalSignals, formatForSmartApi } from "@/lib/technicals";
import { computeTradingScore } from "@/lib/scoring";
import { calculateSupportResistance, nearestLevels, detectPatterns } from "@/lib/tradingSignals";
import { runHistoricalBacktest } from "@/lib/tradingBacktest";
import { computeTradingOpportunityScore, computeRiskRewardLevels } from "@/lib/tradingScore";
import { explainTradingSignal } from "@/lib/ai/explain";

const BATCH_SIZE = 200;
const DELAY_MS = 400; // keeps us at ~2.5 req/sec, safely under the 3/sec published limit

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: state } = await supabase
    .from("trading_scan_state")
    .select("*")
    .eq("id", 1)
    .single();

  const startIndex = state?.last_index ?? 0;
  const { batch, nextIndex } = await getEquityBatch(startIndex, BATCH_SIZE);

  const results = [];

  for (const instrument of batch) {
    try {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 220);

      const candleData = await getHistoricalCandles(
        instrument.token,
        formatForSmartApi(fromDate),
        formatForSmartApi(toDate)
      );

      if (!candleData?.data || candleData.data.length < 60) {
        await sleep(DELAY_MS);
        continue; // not enough history to analyze reliably
      }

      const signals = buildTechnicalSignals(candleData);
      const tradingScore = computeTradingScore(signals);

      const candles = candleData.data;
      const sr = calculateSupportResistance(candles, signals.ma50, signals.ma200);
      const { nearestSupport, nearestResistance } = nearestLevels(signals.price, sr.support, sr.resistance);
      const patterns = detectPatterns(candles);
      const backtest = runHistoricalBacktest(candleData);

      const opportunityScore = computeTradingOpportunityScore({
        tradingScore,
        backtest,
        nearestSupport,
        nearestResistance,
        price: signals.price,
      });

      results.push({
        symbol: instrument.symbol.replace("-EQ", ""),
        token: instrument.token,
        opportunityScore,
        price: signals.price,
        signals,
        support: sr.support,
        resistance: sr.resistance,
        nearestSupport,
        nearestResistance,
        patterns,
        backtest,
        priceHistory: candles.slice(-150).map((c) => ({
          date: c[0]?.slice(0, 10),
          open: c[1], high: c[2], low: c[3], close: c[4],
        })),
      });
    } catch (err) {
      console.log(`TRADING SCAN: skipped ${instrument.symbol}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  // Save scan progress for tomorrow's batch to continue from here.
  await supabase
    .from("trading_scan_state")
    .update({ last_index: nextIndex, updated_at: new Date().toISOString() })
    .eq("id", 1);

  // Rank and take the top 5 by Trading Opportunity Score.
  const top5 = results.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5);

  // Clear today's previous picks (in case this cron runs more than once).
  await supabase.from("trading_daily_picks").delete().eq("scan_date", today());

  let rank = 1;
  for (const pick of top5) {
    const riskReward = computeRiskRewardLevels({
      price: pick.price,
      nearestSupport: pick.nearestSupport,
      nearestResistance: pick.nearestResistance,
    });

    const aiSignal = await explainTradingSignal({
      symbol: pick.symbol,
      opportunityScore: pick.opportunityScore,
      signals: pick.signals,
      support: pick.support,
      resistance: pick.resistance,
      patterns: pick.patterns,
      backtest: pick.backtest,
      riskReward,
    });

    const { error } = await supabase.from("trading_daily_picks").insert({
      scan_date: today(),
      rank,
      symbol: pick.symbol,
      trading_opportunity_score: pick.opportunityScore,
      current_price: pick.price,
      support_levels: pick.support,
      resistance_levels: pick.resistance,
      detected_patterns: pick.patterns,
      backtest: pick.backtest,
      technicals: pick.signals,
      ai_signal: { ...aiSignal, riskReward },
      price_history: pick.priceHistory,
    });

    if (error) {
      console.log(`TRADING PICKS INSERT FAILED for ${pick.symbol}:`, JSON.stringify(error));
    }
    rank++;
  }

  return NextResponse.json({
    scanned: results.length,
    skipped: batch.length - results.length,
    topPicks: top5.map((p) => ({ symbol: p.symbol, score: p.opportunityScore })),
  });
}
