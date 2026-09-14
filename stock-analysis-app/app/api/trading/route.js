import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const { data: picks, error: todayError } = await supabase
    .from("trading_daily_picks")
    .select("*")
    .eq("scan_date", today())
    .order("rank", { ascending: true });

  if (todayError) {
    console.log("TRADING FETCH (today) FAILED:", JSON.stringify(todayError));
  }

  if (picks && picks.length > 0) {
    console.log("TRADING FETCH: returning", picks.length, "picks for today");
    return NextResponse.json({ picks, isToday: true });
  }

  const { data: latest, error: latestError } = await supabase
    .from("trading_daily_picks")
    .select("*")
    .order("scan_date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(20);

  if (latestError) {
    console.log("TRADING FETCH (latest) FAILED:", JSON.stringify(latestError));
  }

  console.log("TRADING FETCH: today count = 0, returning", latest?.length ?? 0, "from fallback");
  return NextResponse.json({ picks: latest || [], isToday: false });
}
