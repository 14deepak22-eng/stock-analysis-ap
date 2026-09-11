const LIST_KEY = "stockscope_dashboard_stocks";
const SUMMARY_PREFIX = "stockscope_summary_";
const FULL_PREFIX = "stockscope_full_";

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
  localStorage.removeItem(FULL_PREFIX + symbol);
}

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

/**
 * Saves the FULL stock page data (scores + analysis + raw_metrics) so
 * revisiting a stock from the dashboard can render instantly from local
 * storage, with zero network calls and zero loading time.
 */
export function saveFullStockData(symbol, data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FULL_PREFIX + symbol, JSON.stringify(data));
  } catch {
    // Storage full or data too large - safe to ignore, falls back to fetching.
  }
}

export function getFullStockData(symbol) {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(FULL_PREFIX + symbol) || "null");
  } catch {
    return null;
  }
}
