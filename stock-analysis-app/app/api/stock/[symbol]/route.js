import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeAndStore } from "@/lib/stockPipeline";

export async function GET(request, { params }) {
  const symbol = params.symbol.toUpperCase();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  if (!forceRefresh) {
    const { data: existingScore } = await supabase
      .from("stock_scores")
      .select("*")
      .eq("symbol", symbol)
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingScore) {
      const { data: analysis } = await supabase
        .from("stock_analysis")
        .select("*")
        .eq("symbol", symbol)
        .order("analysis_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({ score: existingScore, analysis, cached: true });
    }
  }

  try {
    const { score, analysis } = await analyzeAndStore(symbol, { replaceToday: forceRefresh });
    return NextResponse.json({ score, analysis, cached: false });
  } catch (err) {
    console.log("STOCK ROUTE FAILED:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
