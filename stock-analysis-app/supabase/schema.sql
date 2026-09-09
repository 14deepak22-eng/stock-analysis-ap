-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists stocks (
  symbol text primary key,
  company_name text,
  sector text,
  exchange text
);

create table if not exists stock_prices (
  id uuid default gen_random_uuid() primary key,
  symbol text references stocks(symbol),
  trade_date date,
  open float,
  high float,
  low float,
  close float,
  volume float
);

create table if not exists stock_fundamentals (
  id uuid default gen_random_uuid() primary key,
  symbol text references stocks(symbol),
  report_date date,
  pe_ratio float,
  peg_ratio float,
  roe float,
  roce float,
  debt_to_equity float,
  revenue_growth_3y float,
  profit_margin float,
  promoter_holding float,
  sector_pe_median float,
  sector_pe_std float,
  sector_roe_median float,
  sector_roe_std float
);

create table if not exists stock_scores (
  id uuid default gen_random_uuid() primary key,
  symbol text references stocks(symbol),
  score_date date,
  investment_score int,
  trading_score int
);

create table if not exists stock_news (
  id uuid default gen_random_uuid() primary key,
  symbol text references stocks(symbol),
  headline text,
  source text,
  url text,
  published_date date
);

create table if not exists stock_analysis (
  id uuid default gen_random_uuid() primary key,
  symbol text references stocks(symbol),
  analysis_date date,
  investment_analysis jsonb,
  trading_analysis jsonb,
  news_analysis jsonb
);

create table if not exists user_settings (
  user_id uuid references auth.users(id) primary key,
  default_sort text default 'investment',
  min_investment_score int,
  min_trading_score int,
  updated_at timestamp default now()
);

-- Helpful index for "give me today's score fast" lookups
create index if not exists idx_stock_scores_symbol_date on stock_scores(symbol, score_date desc);
create index if not exists idx_stock_analysis_symbol_date on stock_analysis(symbol, analysis_date desc);
