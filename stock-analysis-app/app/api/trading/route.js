import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEquityBatch, getLTP, getSymbolToken } from "@/lib/dataSources/smartapi";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const { data: picks } = await supabase
    .from("trading_daily_picks")
    .select("*")
    .eq("scan_date", today())
    .order("rank", { ascending: true });

  if (!picks || picks.length === 0) {
    // Fall back to the most recent available scan if today's hasn't run yet
    const { data: latest } = await supabase
      .from("trading_daily_picks")
      .select("*")
      .order("scan_date", { ascending: false })
      .order("rank", { ascending: true })
      .limit(5);
    return NextResponse.json({ picks: latest || [], isToday: false });
  }

  return NextResponse.json({ picks, isToday: true });
}
