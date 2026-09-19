import { NextResponse } from "next/server";
import { tryAcquireJobLock, getFreshnessStatus } from "@/lib/intraday/jobLockService";
import { runIntradayRankingJob } from "@/lib/intraday/rankingService";

const FRESHNESS_WINDOW_MS = Number(process.env.INTRADAY_FRESHNESS_WINDOW_MS || 5 * 60 * 1000);

export async function POST(request) {
  // 1. Freshness check first - don't start anything if cache is fine
  const freshness = await getFreshnessStatus("intraday", FRESHNESS_WINDOW_MS);
  if (freshness.isFresh) {
    return NextResponse.json({
      success: true,
      message: "Using cached results - already fresh",
      isFresh: true,
      processing: false,
      lastUpdated: freshness.lastUpdated,
    });
  }

  // 2. Acquire the job lock - single-flight protection
  const lock = await tryAcquireJobLock("intraday", "manual-refresh");
  if (!lock.acquired) {
    return NextResponse.json({
      success: true,
      message: "A ranking job is already in progress",
      processing: true,
    });
  }

  // 3. Fire the scan WITHOUT awaiting it, so this request returns
  // immediately instead of holding the connection open for minutes
  // (this was the exact cause of the earlier "terminated" timeout bug
  // on the Swing trading scan - not repeating that here).
  runIntradayRankingJob(lock.jobId).catch((err) => {
    console.log("INTRADAY BACKGROUND JOB ERROR:", err.message);
  });

  return NextResponse.json({
    success: true,
    processing: true,
    message: "Ranking job started - poll /api/intraday/status for progress",
    jobId: lock.jobId,
  });
}
