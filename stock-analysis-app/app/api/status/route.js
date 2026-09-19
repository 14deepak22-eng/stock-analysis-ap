import { NextResponse } from "next/server";
import { getFreshnessStatus, getCurrentJobStatus } from "@/lib/intraday/jobLockService";

const FRESHNESS_WINDOW_MS = Number(process.env.INTRADAY_FRESHNESS_WINDOW_MS || 5 * 60 * 1000); // 5 min default

function isMarketOpen() {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5) % 24;
  const istMinute = now.getUTCMinutes() + 30;
  const totalMinutes = istHour * 60 + (istMinute >= 60 ? istMinute - 60 : istMinute) + (istMinute >= 60 ? 60 : 0);
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // weekend
  return totalMinutes >= 555 && totalMinutes <= 930; // 9:15 AM - 3:30 PM IST
}

export async function GET() {
  const freshness = await getFreshnessStatus("intraday", FRESHNESS_WINDOW_MS);
  const runningJob = await getCurrentJobStatus("intraday");
  const marketOpen = isMarketOpen();

  return NextResponse.json({
    mode: "intraday",
    marketOpen,
    lastUpdated: freshness.lastUpdated,
    isFresh: freshness.isFresh,
    isStale: freshness.isStale,
    processing: !!runningJob,
    nextSuggestedRefresh: marketOpen
      ? new Date(Date.now() + FRESHNESS_WINDOW_MS).toISOString()
      : null,
  });
}
