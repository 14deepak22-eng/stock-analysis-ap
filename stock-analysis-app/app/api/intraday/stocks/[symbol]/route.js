import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request, { params }) {
  const symbol = params.symbol.toUpperCase();

  const { data: instrument } = await supabase
    .from("instruments")
    .select("id, symbol, company_name, exchange")
    .eq("symbol", symbol)
    .maybeSingle();

  if (!instrument) {
    return NextResponse.json({ success: false, error: "Instrument not found" }, { status: 404 });
  }

  const { data: latest } = await supabase
    .from("intraday_scores")
    .select("*")
    .eq("instrument_id", instrument.id)
    .eq("mode", "intraday")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return NextResponse.json({ success: false, error: "No score data available for this stock" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    symbol: instrument.symbol,
    companyName: instrument.company_name,
    currentPrice: latest.current_price,
    score: latest.score,
    signal: latest.signal,
    indicators: {
      vwap: latest.vwap,
      rsi: latest.rsi,
      ema9: latest.ema9,
      ema20: latest.ema20,
      atr: latest.atr,
      relativeVolume: latest.relative_volume,
    },
    componentScores: {
      momentum: latest.momentum_score,
      volume: latest.volume_score,
      volatility: latest.volatility_score,
      liquidity: latest.liquidity_score,
      marketAlignment: latest.market_alignment_score,
    },
    riskLevels: {
      entry: latest.entry_price,
      stopLoss: latest.stop_loss,
      target: latest.target_price,
      riskRewardRatio: latest.risk_reward_ratio,
    },
    lastUpdated: latest.calculated_at,
    riskWarning: "This is an algorithmic technical score, not a guaranteed prediction. Always verify market conditions independently.",
  });
}
