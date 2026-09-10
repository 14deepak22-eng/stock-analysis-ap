const LIST_KEY = "stockscope_dashboard_stocks";
const SUMMARY_PREFIX = "stockscope_summary_";

export function getDashboardStocks() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToDashboard(symbol) {
  if (typeof window === "undefined") return;
  const current = getDashboardStocks();
  if (!current.includes(symbol)) {
    localStorage.setItem(LIST_KEY, JSON.stringify([symbol, ...current].slice(0, 20)));
  }
}

export function removeFromDashboard(symbol) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LIST_KEY,
    JSON.stringify(getDashboardStocks().filter((s) => s !== symbol))
  );
  localStorage.removeItem(SUMMARY_PREFIX + symbol);
}

/**
 * Saves a lightweight snapshot of a stock's scores so the dashboard can
 * render instantly from local data, with zero network calls, instead of
 * re-fetching every saved stock on every dashboard visit.
 */
export function saveStockSummary(symbol, data) {
  if (typeof window === "undefined") return;
  const summary = {
    investment_score: data?.score?.investment_score ?? null,
    trading_score: data?.score?.trading_score ?? null,
    overall_score: data?.score?.overall_score ?? null,
    news_sentiment: data?.analysis?.news_analysis?.sentiment ?? null,
    score_date: data?.score?.score_date ?? null,
  };
  localStorage.setItem(SUMMARY_PREFIX + symbol, JSON.stringify(summary));
}

export function getStockSummary(symbol) {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_PREFIX + symbol) || "null");
  } catch {
    return null;
  }
}
