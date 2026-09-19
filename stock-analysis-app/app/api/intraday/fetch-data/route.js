import { NextResponse } from "next/server";
import { tryAcquireJobLock, getFreshnessStatus } from "@/lib/intraday/jobLockService";
import { runIntradayRankingJob } from "@/lib/intraday/rankingService";

const FRESHNESS_WINDOW_MS = Number(process.env.INTRADAY_FRESHNESS_WINDOW_MS || 5 * 60 * 1000);

export async function POST(request) {
  // 1. Check freshness first - don't even attempt a job if cache is fine
  const freshness = await getFreshnessStatus("intraday", FRESHNESS_WINDOW_MS);
  if (freshness.isFresh) {
    return NextResponse.json({
      success: true,
      message: "Using cached results - already fresh",
      isFresh: true,
      lastUpdated: freshness.lastUpdated,
    });
  }

  // 2. Try to acquire the job lock - single-flight protection
  const lock = await tryAcquireJobLock("intraday", "manual-refresh");
  if (!lock.acquired) {
    return NextResponse.json({
      success: true,
      message: "A ranking job is already in progress",
      processing: true,
    });
  }

  // 3. Run the scan (this request will wait for it to complete - see note below)
  const result = await runIntradayRankingJob(lock.jobId);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    processing: false,
    scanned: result.scanned,
    totalInstruments: result.totalInstruments,
    calculatedAt: result.calculatedAt,
  });
}
