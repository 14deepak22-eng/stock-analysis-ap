const KEY = "stockscope_dashboard_stocks";

export function getDashboardStocks() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToDashboard(symbol) {
  if (typeof window === "undefined") return;
  const current = getDashboardStocks();
  if (!current.includes(symbol)) {
    localStorage.setItem(KEY, JSON.stringify([symbol, ...current].slice(0, 20)));
  }
}

export function removeFromDashboard(symbol) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    KEY,
    JSON.stringify(getDashboardStocks().filter((s) => s !== symbol))
  );
}
