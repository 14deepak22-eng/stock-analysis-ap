import { supabase } from "@/lib/supabase";

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function addToUserDashboard(symbol) {
  const user = await getCurrentUser();
  if (!user) {
    console.log("addToUserDashboard: no logged-in user found");
    return;
  }
  const { error } = await supabase
    .from("user_dashboard_stocks")
    .upsert({ user_id: user.id, symbol }, { onConflict: "user_id,symbol" });

  if (error) {
    console.log("addToUserDashboard FAILED:", JSON.stringify(error));
  } else {
    console.log("addToUserDashboard succeeded for", symbol);
  }
}

export async function removeFromUserDashboard(symbol) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase
    .from("user_dashboard_stocks")
    .delete()
    .eq("user_id", user.id)
    .eq("symbol", symbol);
}

/**
 * Returns the user's saved stocks with their latest cached scores,
 * joined in one query - pure database read, zero external API calls.
 */
export async function getUserDashboardWithScores() {
  const user = await getCurrentUser();
  if (!user) return null; // not logged in - caller should fall back to localStorage

  const { data: saved } = await supabase
    .from("user_dashboard_stocks")
    .select("symbol, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (!saved || saved.length === 0) return [];

  const symbols = saved.map((s) => s.symbol);

  const { data: scores } = await supabase
    .from("stock_scores")
    .select("symbol, investment_score, trading_score, overall_score, score_date")
    .in("symbol", symbols);

  const { data: analyses } = await supabase
    .from("stock_analysis")
    .select("symbol, news_analysis")
    .in("symbol", symbols);

  return saved.map((s) => {
    const scoreRows = (scores || []).filter((sc) => sc.symbol === s.symbol);
    const latestScore = scoreRows.sort((a, b) => (a.score_date < b.score_date ? 1 : -1))[0];
    const analysisRow = (analyses || []).find((a) => a.symbol === s.symbol);
    return {
      symbol: s.symbol,
      investment_score: latestScore?.investment_score ?? null,
      trading_score: latestScore?.trading_score ?? null,
      overall_score: latestScore?.overall_score ?? null,
      news_sentiment: analysisRow?.news_analysis?.sentiment ?? null,
      score_date: latestScore?.score_date ?? null,
    };
  });
}
