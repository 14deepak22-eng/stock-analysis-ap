let instrumentCache = null;

/**
 * Looks up the symbol_token for an NSE equity symbol, using Angel One's
 * public instrument master file. Cached in memory after first fetch since
 * the file is large (~5MB) and doesn't change during a single server run.
 */
export async function getSymbolToken(symbol) {
  if (!instrumentCache) {
    const res = await fetch(
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    );
    instrumentCache = await res.json();
  }

  const match = instrumentCache.find(
    (i) => i.symbol === `${symbol}-EQ` && i.exch_seg === "NSE"
  );

  if (!match) {
    throw new Error(`Could not find Angel One symbol_token for ${symbol}`);
  }

  return { token: match.token, tradingSymbol: match.symbol };
}
