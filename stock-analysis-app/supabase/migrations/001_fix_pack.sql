-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (everything is "if not exists" / "create or replace").

-- 1) Columns the app already writes but schema.sql never created.
alter table stock_scores   add column if not exists overall_score int;
alter table stock_analysis add column if not exists verdict      jsonb;
alter table stock_analysis add column if not exists raw_metrics  jsonb;

-- 2) One row per stock: its most recent score. Used by /api/screener so the
--    filters are applied to each stock's LATEST score, not to old history.
--    security_invoker makes the view obey row-level security of the caller.
create or replace view latest_stock_scores
with (security_invoker = true) as
select distinct on (s.symbol)
  s.symbol,
  s.investment_score,
  s.trading_score,
  s.overall_score,
  s.score_date,
  st.company_name,
  st.sector
from stock_scores s
left join stocks st on st.symbol = s.symbol
order by s.symbol, s.score_date desc, s.id desc;

-- 3) OPTIONAL, run only after you have removed duplicate (symbol, score_date)
--    rows. Prevents two scores for the same stock on the same day.
--    To find duplicates first:
--      select symbol, score_date, count(*) from stock_scores
--      group by 1, 2 having count(*) > 1;
-- create unique index if not exists uq_stock_scores_symbol_date
--   on stock_scores (symbol, score_date);
