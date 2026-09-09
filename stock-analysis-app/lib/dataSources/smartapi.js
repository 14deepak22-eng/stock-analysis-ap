// Wrapper around Angel One SmartAPI for prices and historical candles.
//
// SmartAPI requires logging in with your API key + client ID + password +
// a TOTP code (like Google Authenticator) to get a session token (JWT).
// The token expires, so we log in fresh each time this runs (once daily,
// triggered by the cron job) rather than trying to keep a session alive.
//
// You'll need the `otplib` package to generate the TOTP code from your
// TOTP secret (Angel One gives you this when you enable 2FA for API use):
//   npm install otplib

import { authenticator } from "otplib";

const BASE_URL = "https://apiconnect.angelone.in";

async function login() {
  const totp = authenticator.generate(process.env.ANGEL_ONE_TOTP_SECRET);

  const res = await fetch(`${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PrivateKey": process.env.ANGEL_ONE_API_KEY,
      // The headers below are required by SmartAPI but can be set to
      // reasonable placeholder values for a server-side app.
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

/**
 * Fetches daily candles for a symbol between two dates.
 * `symbolToken` is Angel One's internal instrument ID, not the plain
 * ticker - you look this up once from their instrument master file
 * (a JSON list they publish) and store it alongside your stock in
 * Supabase so you don't have to look it up every time.
 */
export async function getHistoricalCandles(symbolToken, fromDate, toDate) {
  return smartApiRequest("/rest/secure/angelbroking/historical/v1/getCandleData", {
    exchange: "NSE",
    symboltoken: symbolToken,
    interval: "ONE_DAY",
    fromdate: fromDate, // format: "2026-01-01 09:15"
    todate: toDate,
  });
}

/**
 * Fetches the last traded price for a symbol.
 */
export async function getLTP(symbolToken, tradingSymbol) {
  return smartApiRequest("/rest/secure/angelbroking/order/v1/getLtpData", {
    exchange: "NSE",
    tradingsymbol: tradingSymbol, // e.g. "RELIANCE-EQ"
    symboltoken: symbolToken,
  });
}
