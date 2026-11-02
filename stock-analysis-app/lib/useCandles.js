"use client";

import { useCallback, useEffect, useState } from "react";

const REQUEST_TIMEOUT_MS = 30000;
const NETWORK_RETRIES = 2; // so up to 3 tries in total

// AbortSignal.any isn't available in older browsers (e.g. Safari before 17.4),
// so combine the "user navigated away" and "timed out" signals by hand there.
function combineSignals(...signals) {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const combined = new AbortController();
  for (const s of signals) {
    if (s.aborted) combined.abort(s.reason);
    else s.addEventListener("abort", () => combined.abort(s.reason), { once: true });
  }
  return combined.signal;
}

function friendlyError(err) {
  if (err?.name === "AbortError" || err?.name === "TimeoutError") {
    return "The server took too long to answer. Try again in a moment.";
  }
  if (err instanceof TypeError) {
    // fetch() itself failed - the request never got a proper reply at all
    // (server restarting or waking up, dropped connection, no internet).
    return "Couldn't reach the server - it may be restarting or waking up. Try again in a few seconds.";
  }
  return err?.message || "Something went wrong loading the chart.";
}

/**
 * Loads candles for a symbol + interval.
 *   - ignores answers that arrive after you've already switched interval
 *     (the old code let a slow reply overwrite a newer one),
 *   - retries by itself when the connection drops or the request times out,
 *   - gives a readable message when it finally gives up.
 */
export function useCandles(symbol, interval) {
  const [state, setState] = useState({ candles: [], loading: true, error: null, retrying: false, stale: false });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null, retrying: false }));

    async function run() {
      let lastErr = null;
      for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
        if (cancelled) return;
        if (attempt > 0) {
          setState((s) => ({ ...s, retrying: true }));
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          if (cancelled) return;
        }
        try {
          const res = await fetch(
            `/api/trading/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
            {
              signal: combineSignals(controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
              cache: "no-store",
            }
          );
          let body = null;
          try {
            body = await res.json();
          } catch {
            throw new TypeError("Server sent an unreadable reply");
          }
          if (!res.ok || body?.error) {
            // The server answered: a real error, so retrying immediately won't help.
            setState({ candles: [], loading: false, error: body?.error || `Server error (${res.status})`, retrying: false, stale: false });
            return;
          }
          if (cancelled) return;
          setState({ candles: body.candles || [], loading: false, error: null, retrying: false, stale: Boolean(body.stale) });
          return;
        } catch (err) {
          if (cancelled || controller.signal.aborted) return;
          lastErr = err;
        }
      }
      if (!cancelled) {
        setState({ candles: [], loading: false, error: friendlyError(lastErr), retrying: false, stale: false });
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, interval, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { ...state, reload };
}
