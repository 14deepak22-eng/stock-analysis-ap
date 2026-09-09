import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeInvestmentScore, computeTradingScore } from "@/lib/scoring";
import { explainScore, explainNewsSentiment } from "@/lib/ai/explain";
import { getStockOverview, getSectorPeers } from "@/lib/dataSources/bharatstock";
import { getHistoricalCandles } from "@/lib/dataSources/smartapi";
import { getRecentHeadlines } from "@/lib/dataSources/news";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// This route is triggered automatically once a day by Vercel Cron
// (see vercel.json). It refreshes every stock already tracked in the
// `stocks` table. New stocks get added on-demand when a user searches
// them (see app/api/stock/[symbol]/route.js) - the next day's cron run
// then keeps them updated automatically.
export async function GET(request) {
  // Simple protection so random visitors can't trigger this manually
  // and burn through your daily API quota. Vercel sends this header
  // automatically for scheduled cron calls.
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: stocks, error } = await supabase.from("stocks").select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const stock of stocks) {
    try {
      await refreshOneStock(stock);
      results.push({ symbol: stock.symbol, status: "ok" });
    } catch (err) {
      // One stock failing shouldn't stop the whole job.
      results.push({ symbol: stock.symbol, status: "error", message: err.message });
    }
  }

  return NextResponse.json({ refreshed: results.length, results });
}

async function refreshOneStock(stock) {
  const symbol = stock.symbol;

  // 1. Fundamentals + Investment score
  const overview = await getStockOverview(symbol);
  const peers = await getSectorPeers(overview.sector);
  const fundamentals = { ...overview.metrics }; // sector stats attached similarly to the on-demand route
  const investmentScore = computeInvestmentScore(fundamentals);

  // 2. Technicals + Trading score
  // symbol_token needs to be stored on your `stocks` row once you've
  // looked it up from Angel One's instrument master file.
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 200); // enough history for the 200-day MA

  const candleData = await getHistoricalCandles(
    stock.symbol_token,
    formatForSmartApi(fromDate),
    formatForSmartApi(toDate)
  );
  const signals = buildTechnicalSignals(candleData);
  const tradingScore = computeTradingScore(signals);

  // 3. Save scores
  await supabase.from("stock_scores").insert({
    symbol,
    score_date: today(),
    investment_score: investmentScore,
    trading_score: tradingScore,
  });

  // 4. AI explanations (once per stock per day)
  const investmentAnalysis = await explainScore(symbol, "Investment", investmentScore, fundamentals);
  const tradingAnalysis = await explainScore(symbol, "Trading", tradingScore, signals);

  const headlines = await getRecentHeadlines(overview.company_name);
  const newsAnalysis = await explainNewsSentiment(overview.company_name, headlines);

  await supabase.from("stock_analysis").insert({
    symbol,
    analysis_date: today(),
    investment_analysis: investmentAnalysis,
    trading_analysis: tradingAnalysis,
    news_analysis: newsAnalysis,
  });
}

function formatForSmartApi(date) {
  // SmartAPI expects "YYYY-MM-DD HH:mm"
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function buildTechnicalSignals(candleData) {
  // candleData.data is an array of [timestamp, open, high, low, close, volume]
  const candles = candleData?.data ?? [];
  const closes = candles.map((c) => c[4]);
  const volumes = candles.map((c) => c[5]);

  const price = closes.at(-1);
  const ma50 = average(closes.slice(-50));
  const ma200 = average(closes.slice(-200));
  const rsi = computeRSI(closes.slice(-15));
  const { macdLine, macdSignal } = computeMACD(closes);
  const recentVolume = average(volumes.slice(-5));
  const avgVolume = average(volumes.slice(-30));
  const priceRising = closes.at(-1) > closes.at(-6);

  return { price, ma50, ma200, rsi, macdLine, macdSignal, recentVolume, avgVolume, priceRising };
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeRSI(closes) {
  if (closes.length < 2) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / closes.length;
  const avgLoss = losses / closes.length;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes) {
  const ema = (period, values) => {
    const k = 2 / (period + 1);
    let emaVal = values[0];
    for (let i = 1; i < values.length; i++) {
      emaVal = values[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  };
  const ema12 = ema(12, closes.slice(-26));
  const ema26 = ema(26, closes.slice(-26));
  const macdLine = ema12 - ema26;
  const macdSignal = macdLine * 0.9; // simplified placeholder signal line
  return { macdLine, macdSignal };
}
