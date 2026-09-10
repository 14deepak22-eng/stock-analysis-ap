// Wrapper around Angel One SmartAPI for prices and historical candles.
//
// SmartAPI requires logging in with your API key + client ID + password +
// a TOTP code to get a session token (JWT). We log in fresh each call
// rather than trying to keep a session alive.

import { authenticator } from "otplib";

const BASE_URL = "https://apiconnect.angelone.in";

async function login() {
  const totp = authenticator.generate(process.env.ANGEL_ONE_TOTP_SECRET);

  const res = await fetch(`${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PrivateKey": process.env.ANGEL_ONE_API_KEY,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
    },
    body: JSON.stringify({
      clientcode: process.env.ANGEL_ONE_CLIENT_ID,
      password: process.env.ANGEL_ONE_PASSWORD,
      totp,
    }),
  });

  const data = await res.json();
  if (!data.status) {
    throw new Error(`Angel One login failed: ${data.message}`);
  }
  return data.data.jwtToken;
}

async function smartApiRequest(path, body) {
  const token = await login();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PrivateKey": process.env.ANGEL_ONE_API_KEY,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getHistoricalCandles(symbolToken, fromDate, toDate) {
  return smartApiRequest("/rest/secure/angelbroking/historical/v1/getCandleData", {
    exchange: "NSE",
    symboltoken: symbolToken,
    interval: "ONE_DAY",
    fromdate: fromDate,
    todate: toDate,
  });
}

export async function getLTP(symbolToken, tradingSymbol) {
  return smartApiRequest("/rest/secure/angelbroking/order/v1/getLtpData", {
    exchange: "NSE",
    tradingsymbol: tradingSymbol,
    symboltoken: symbolToken,
  });
}

let instrumentCache = null;

/**
 * Looks up the symbol_token for an NSE equity symbol, using Angel One's
 * public instrument master file. Cached in memory after first fetch.
 */
export async function getSymbolToken(symbol) {
    if (!instrumentCache) {
    const res = await fetch(
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
        },
      }
    );
    const text = await res.text();
    if (text.trim().startsWith("<") || text.includes("Access den")) {
      console.log(`INSTRUMENT FETCH BLOCKED - status ${res.status}, body: ${text.slice(0, 300)}`);
      throw new Error(`Instrument file fetch blocked (status ${res.status})`);
    }
    try {
      instrumentCache = JSON.parse(text);
    } catch {
      console.log(`INSTRUMENT FETCH - unexpected non-JSON body: ${text.slice(0, 300)}`);
      throw new Error("Instrument file returned unexpected format");
    }
  }
  const match = instrumentCache.find(
    (i) => i.symbol === `${symbol}-EQ` && i.exch_seg === "NSE"
  );

  if (!match) {
    throw new Error(`Could not find Angel One symbol_token for ${symbol}`);
  }

  return { token: match.token, tradingSymbol: match.symbol };
}
