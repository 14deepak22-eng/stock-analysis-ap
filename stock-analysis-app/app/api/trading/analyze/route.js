import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { explainTradingSignal } from "@/lib/ai/explain";

export async function POST(request) {
  const { symbol } = await request.json();
  if (!symbol) {
    return NextResponse.json({ error: "Symbol required" }, { status: 400 });
  }

  const { data: pick } = await supabase
    .from("trading_daily_picks")
    .select("*")
    .eq("symbol", symbol)
    .order("scan_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pick) {
    return NextResponse.json({ error: "No scan data found for this stock" }, { status: 404 });
  }

  // If AI analysis was already generated for this exact scan, reuse it -
  // don't spend another AI call re-analyzing the same data.
  if (pick.ai_signal?.overallRead) {
    return NextResponse.json({ aiSignal: pick.ai_signal });
  }

  const riskReward = pick.ai_signal?.riskReward;

  const aiSignal = await explainTradingSignal({
    symbol: pick.symbol,
    opportunityScore: pick.trading_opportunity_score,
    signals: pick.technicals,
    support: pick.support_levels,
    resistance: pick.resistance_levels,
    patterns: pick.detected_patterns,
    backtest: pick.backtest,
    riskReward,
  });

  const updatedAiSignal = { ...aiSignal, riskReward };

  await supabase
    .from("trading_daily_picks")
    .update({ ai_signal: updatedAiSignal })
    .eq("symbol", symbol)
    .eq("scan_date", pick.scan_date);

  return NextResponse.json({ aiSignal: updatedAiSignal });
}
