// Orchestrates one full intraday ranking run: fetches candles for the
// active instrument universe, calculates indicators and scores, saves
// results. Respects configurable rate limits per the spec's env-variable
// requirement rather than hardcoded assumptions.

import { supabase } from "@/lib/supabase";
import { getActiveInstruments } from "@/lib/intraday/instrumentService";
import { getHistoricalCandles } from "@/lib/dataSources/smartapi";
import { formatForSmartApi } from "@/lib/technicals";
import { calculateAllIndicators } from "@/lib/intraday/indicatorService";
import { calculateIntradayScore } from "@/lib/intraday/scoringService";
import { calculateRiskLevels } from "@/lib/intraday/riskLevelsService";
import { tryAcquireJobLock, completeJob, failJob } from "@/lib/intraday/jobLockService";

const REQ_PER_SECOND = Number(process.env.SMARTAPI_MAX_HISTORICAL_REQUESTS_PER_SECOND || 2);
const DELAY_MS = Math.ceil(1000 / REQ_PER_SECOND);
const MAX_RETRIES = Number(process.env.SMARTAPI_MAX_RETRIES || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCandleObjects(rawData) {
  return (rawData?.data ?? []).map((c) => ({
    timestamp: c[0],
    open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
  }));
}

async function fetchWithRetry(fn, retries = MAX_RETRIES) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await sleep(500);
      return fetchWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

/**
 * Runs one full intraday scan. Meant to be called only after a job lock
 * has been acquired by the caller (see /api/intraday/fetch-data route).
 */
export async function runIntradayRankingJob(jobId) {
  try {
    const instruments = await getActiveInstruments();
    if (instruments.length === 0) {
      await failJob(jobId, "No active instruments configured");
      return { success: false, error: "No active instruments" };
    }

    const results = [];
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - 20); // enough for average volume baseline

    for (const instrument of instruments) {
      try {
        const [candles5minRaw, candles15minRaw] = await Promise.all([
          fetchWithRetry(() =>
            getHistoricalCandles(
              instrument.smartapi_token,
              formatForSmartApi(dayStart),
              formatForSmartApi(now),
              "FIVE_MINUTE"
            )
          ),
          fetchWithRetry(() =>
            getHistoricalCandles(
              instrument.smartapi_token,
              formatForSmartApi(historyStart),
              formatForSmartApi(now),
              "FIFTEEN_MINUTE"
            )
          ),
        ]);

        const candles5min = toCandleObjects(candles5minRaw);
        const candles15min = toCandleObjects(candles15minRaw);

        if (candles5min.length === 0) {
          await sleep(DELAY_MS);
          continue; // no data today - market closed or no trades yet
        }

        // Historical average volume: mean daily volume over the 15-min
        // dataset's span, used as the liquidity/relative-volume baseline.
        const totalHistoricalVolume = candles15min.reduce((sum, c) => sum + (c.volume || 0), 0);
        const historicalAvgVolume = candles15min.length > 0 ? totalHistoricalVolume / 20 : null;

        const indicators = calculateAllIndicators(candles5min, candles15min, historicalAvgVolume);
        const scoring = calculateIntradayScore(indicators, historicalAvgVolume, null); // market alignment TBD
        const riskLevels = calculateRiskLevels(indicators);

        results.push({
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          companyName: instrument.company_name,
          indicators,
          scoring,
          riskLevels,
          dataTimestamp: candles5min.at(-1)?.timestamp ?? now.toISOString(),
        });
      } catch (err) {
        console.log(`INTRADAY SCAN: skipped ${instrument.symbol}: ${err.message}`);
      }
      await sleep(DELAY_MS);
    }

    // Rank by score, descending
    results.sort((a, b) => b.scoring.totalScore - a.scoring.totalScore);

    const calculatedAt = new Date().toISOString();
    let rank = 1;
    for (const r of results) {
      const { error } = await supabase.from("intraday_scores").insert({
        instrument_id: r.instrumentId,
        mode: "intraday",
        calculated_at: calculatedAt,
        score: r.scoring.totalScore,
        rank,
        signal: r.scoring.signal,
        momentum_score: r.scoring.componentScores.momentum,
        volume_score: r.scoring.componentScores.volume,
        volatility_score: r.scoring.componentScores.volatility,
        liquidity_score: r.scoring.componentScores.liquidity,
        market_alignment_score: r.scoring.componentScores.marketAlignment,
        current_price: r.indicators.currentPrice,
        price_change: r.indicators.priceChange,
        price_change_percentage: r.indicators.priceChangePercentage,
        vwap: r.indicators.vwap,
        rsi: r.indicators.rsi,
        ema9: r.indicators.ema9,
        ema20: r.indicators.ema20,
        relative_volume: r.indicators.relativeVolume,
        atr: r.indicators.atr,
        entry_price: r.riskLevels?.entry ?? null,
        stop_loss: r.riskLevels?.stopLoss ?? null,
        target_price: r.riskLevels?.target ?? null,
        risk_reward_ratio: r.riskLevels?.riskRewardRatio ?? null,
        data_timestamp: r.dataTimestamp,
        score_version: 1,
        is_stale: false,
      });

      if (error) {
        console.log(`INTRADAY SCORE INSERT FAILED for ${r.symbol}:`, JSON.stringify(error));
      }
      rank++;
    }

    await completeJob(jobId, calculatedAt);
    return { success: true, scanned: results.length, totalInstruments: instruments.length, calculatedAt };
  } catch (err) {
    console.log("INTRADAY RANKING JOB FAILED:", err.message);
    await failJob(jobId, err.message);
    return { success: false, error: err.message };
  }
}
