// Wrapper around Angel One SmartAPI for prices and historical candles.
//
// SmartAPI requires logging in with your API key + client ID + password +
// a TOTP code to get a session token (JWT). The token is cached in memory and
// refreshed automatically when it expires or Angel One rejects it.

import { authenticator } from "otplib";

const BASE_URL = "https://apiconnect.angelone.in";
const INSTRUMENT_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function angelHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-PrivateKey": process.env.ANGEL_ONE_API_KEY,
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    ...extra,
  };
}

/**
 * Angel One sometimes answers with plain text or HTML instead of JSON - most
 * often "Access denied because of exceeding access rate". Calling res.json()
 * on that throws an unhelpful "Unexpected token A..." error, so read the text
 * first and turn it into a clear, retryable error.
 */
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    const err = new Error(`Angel One returned a non-JSON reply (HTTP ${res.status}): ${snippet}`);
    err.retryable = /access denied|rate|too many|exceed/i.test(snippet) || res.status >= 500 || res.status === 429;
    throw err;
  }
}

// ---- Session token ---------------------------------------------------

let cachedToken = null;
let tokenExpiry = 0;
let loginInFlight = null; // several requests arriving together share ONE login

function clearToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

async function login() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    const totp = authenticator.generate(process.env.ANGEL_ONE_TOTP_SECRET);
    const res = await fetch(`${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      method: "POST",
      headers: angelHeaders(),
      body: JSON.stringify({
        clientcode: process.env.ANGEL_ONE_CLIENT_ID,
        password: process.env.ANGEL_ONE_PASSWORD,
        totp,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await readJson(res);
    if (!data.status) {
      throw new Error(`Angel One login failed: ${data.message}`);
    }
    cachedToken = data.data.jwtToken;
    tokenExpiry = Date.now() + 1000 * 60 * 60 * 6; // reuse for 6 hours
    return cachedToken;
  })();

  try {
    return await loginInFlight;
  } finally {
    loginInFlight = null;
  }
}

// Error codes Angel One uses for an invalid / expired session token.
const TOKEN_ERROR_CODES = new Set(["AG8001", "AG8002", "AG8003"]);

async function smartApiRequest(path, body) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const token = await login();
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: angelHeaders({ Authorization: `Bearer ${token}` }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await readJson(res);

      // Session expired on Angel One's side before our 6 hours were up:
      // forget the token and go round again with a fresh login.
      if (data && data.status === false && TOKEN_ERROR_CODES.has(data.errorcode)) {
        clearToken();
        lastError = new Error(`Angel One session expired (${data.errorcode})`);
        continue;
      }
      return data;
    } catch (err) {
      lastError = err;
      // Network blips, timeouts and rate limits are worth retrying;
      // anything else (bad credentials, bad TOTP secret) is not.
      const retryable = err.retryable || err.name === "TimeoutError" || err.name === "AbortError" || err instanceof TypeError;
      if (!retryable) break;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(600 * attempt); // 0.6s, then 1.2s
  }

  throw new Error(`Angel One request failed: ${lastError?.message ?? "unknown error"}`);
}

export async function getHistoricalCandles(symbolToken, fromDate, toDate, interval = "ONE_DAY") {
  return smartApiRequest("/rest/secure/angelbroking/historical/v1/getCandleData", {
    exchange: "NSE",
    symboltoken: symbolToken,
    interval,
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

// ---- Instrument master file ------------------------------------------
//
// Angel One publishes one big JSON file (every segment, every contract) that
// maps symbols to tokens. We only ever need plain NSE equities ("-EQ"), so:
//   * it is downloaded ONCE even when many requests arrive together (the old
//     code let every concurrent request download and parse its own copy),
//   * only the NSE equity rows are kept, the rest is thrown away, and
//   * the result is refreshed once a day.

const INSTRUMENT_TTL_MS = 1000 * 60 * 60 * 24;

let instrumentData = null; // { equities: [...], bySymbol: Map, loadedAt }
let instrumentLoad = null; // in-flight download shared by every caller

async function downloadInstruments() {
  const res = await fetch(INSTRUMENT_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  if (text.trim().startsWith("<") || text.includes("Access den")) {
    console.log(`INSTRUMENT FETCH BLOCKED - status ${res.status}, body: ${text.slice(0, 300)}`);
    throw new Error(`Instrument file fetch blocked (status ${res.status})`);
  }

  let all;
  try {
    all = JSON.parse(text);
  } catch {
    console.log(`INSTRUMENT FETCH - unexpected non-JSON body: ${text.slice(0, 300)}`);
    throw new Error("Instrument file returned unexpected format");
  }

  const equities = [];
  const bySymbol = new Map();
  for (const i of all) {
    if (i.exch_seg === "NSE" && typeof i.symbol === "string" && i.symbol.endsWith("-EQ")) {
      const row = { token: i.token, symbol: i.symbol, name: i.name, exch_seg: "NSE" };
      equities.push(row);
      bySymbol.set(i.symbol, row);
    }
  }
  if (equities.length === 0) throw new Error("Instrument file contained no NSE equities");
  return { equities, bySymbol, loadedAt: Date.now() };
}

async function loadInstruments() {
  if (instrumentData && Date.now() - instrumentData.loadedAt < INSTRUMENT_TTL_MS) {
    return instrumentData;
  }
  if (!instrumentLoad) {
    instrumentLoad = downloadInstruments()
      .then((data) => {
        instrumentData = data;
        return data;
      })
      .finally(() => {
        instrumentLoad = null; // a failure must not be cached - the next call retries
      });
  }
  try {
    return await instrumentLoad;
  } catch (err) {
    if (instrumentData) return instrumentData; // stale copy beats no copy
    throw err;
  }
}

/**
 * Returns a batch of NSE equity symbols from Angel One's instrument
 * master file, starting at `startIndex`, for the daily trading scan.
 * Plain equity ("-EQ") listings only.
 */
export async function getEquityBatch(startIndex, count) {
  const { equities } = await loadInstruments();

  const wrappedStart = startIndex % equities.length;
  const batch = [];
  for (let i = 0; i < count; i++) {
    batch.push(equities[(wrappedStart + i) % equities.length]);
  }

  return { batch, totalCount: equities.length, nextIndex: (wrappedStart + count) % equities.length };
}

/**
 * Looks up the symbol_token for an NSE equity symbol, using Angel One's
 * public instrument master file (downloaded once, then cached).
 */
export async function getSymbolToken(symbol) {
  const { bySymbol } = await loadInstruments();
  const match = bySymbol.get(`${symbol}-EQ`);

  if (!match) {
    throw new Error(`Could not find Angel One symbol_token for ${symbol}`);
  }

  return { token: match.token, tradingSymbol: match.symbol };
}
