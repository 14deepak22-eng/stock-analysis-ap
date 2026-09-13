import { NextResponse } from "next/server";
import { getSymbolToken, getLTP } from "@/lib/dataSources/smartapi";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
  }

  const symbols = symbolsParam.split(",");
  const prices = {};

  for (const symbol of symbols) {
    try {
      const { token, tradingSymbol } = await getSymbolToken(symbol);
      const result = await getLTP(token, tradingSymbol);
      prices[symbol] = result?.data?.ltp ?? null;
    } catch (err) {
      prices[symbol] = null;
    }
  }

  return NextResponse.json({ prices });
}
