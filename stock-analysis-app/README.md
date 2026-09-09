# StockScope — AI Stock Analysis (Indian Markets)

Investment score (fundamentals) + Trading score (technicals) + News sentiment,
each explained in plain language. Scores are computed by deterministic
formulas — the AI only explains them, it never invents a number.

## Project structure

```
app/
  page.js                    - Home page (stock search)
  screener/page.js           - Screener/filter UI
  stock/[symbol]/page.js     - Stock detail page (both scores + news)
  login/page.js              - Email/password sign in & sign up
  api/
    stock/[symbol]/route.js  - Returns cached analysis, or fetches fresh
                                data on-demand for a stock searched for
                                the first time
    screener/route.js        - Filter/sort stocks by score
    cron/refresh/route.js    - Daily job: refreshes ALL tracked stocks

lib/
  supabase.js                 - Supabase client
  scoring.js                  - Investment score + Trading score formulas
  ai/explain.js                - Claude API calls (explanation + news sentiment)
  dataSources/
    bharatstock.js            - Fundamentals API
    smartapi.js                - Angel One SmartAPI (prices/candles)
    news.js                     - Google News RSS fetcher

supabase/schema.sql            - Run this once in Supabase to create your tables
vercel.json                    - Daily cron job schedule
.env.example                   - Copy to .env.local and fill in your keys
```

## Quick start

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your real keys
3. Create a Supabase project, then run `supabase/schema.sql` in its SQL Editor
4. `npm run dev` and open http://localhost:3000
5. Deploy to Vercel (see the full deployment guide provided separately)

## Important: a few things you'll need to finish

This scaffold is fully wired end-to-end but has a couple of placeholders
you'll fill in as you go, since they depend on your own accounts and real
API responses:

- **`lib/dataSources/smartapi.js`** — the login flow follows Angel One's
  documented pattern, but test it against your real account. You'll also
  need to look up each stock's `symbol_token` from Angel One's instrument
  master file and store it on the `stocks` table (add a `symbol_token`
  column, or extend `schema.sql`) before the cron job can fetch its candles.
- **`app/api/stock/[symbol]/route.js`** — the field names read from
  BharatStock's response (`overview.metrics`, `overview.sector`, etc.)
  are based on their documented shape. Once you make your first real
  request, check the actual JSON and adjust field names if they differ.
- **`computeMACD` in the cron route** uses a simplified signal line.
  Fine for an MVP; swap in a proper 9-period EMA of the MACD line later
  if you want more precision.

None of these block you from running the app — they just need a real
API response in front of you to fine-tune, which is normal for
first-time integration work.

## Not investment advice

This app shows computed scores and AI-generated explanations for
informational purposes only. It is not investment advice. Add the
disclaimer text (already included in the stock detail page) anywhere
scores or suggestions are shown.
