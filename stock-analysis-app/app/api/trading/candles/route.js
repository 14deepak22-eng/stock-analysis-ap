import { NextResponse } from "next/server";
import { getSymbolToken, getHistoricalCandles } from "@/lib/dataSources/smartapi";
import { formatForSmartApi, formatCandlesForChart, INTERVAL_OPTIONS } from "@/lib/technicals";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const intervalKey = searchParams.get("interval") || "1day";

  const config = INTERVAL_OPTIONS[intervalKey];
  if (!symbol || !config) {
    return NextResponse.json({ error: "Invalid symbol or interval" }, { status: 400 });
  }

  try {
    const { token } = await getSymbolToken(symbol);
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - config.lookbackDays);

    const candleData = await getHistoricalCandles(
      token,
      formatForSmartApi(fromDate),
      formatForSmartApi(toDate),
      config.apiValue
    );

    const candles = formatCandlesForChart(candleData);
    return NextResponse.json({ candles, interval: intervalKey });
  } catch (err) {
    console.log("CANDLES FETCH FAILED:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
