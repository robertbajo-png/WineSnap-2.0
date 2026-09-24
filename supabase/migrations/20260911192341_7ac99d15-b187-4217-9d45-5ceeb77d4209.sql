ALTER TABLE public.wines
  ADD COLUMN IF NOT EXISTS systembolaget_id text,
  ADD COLUMN IF NOT EXISTS systembolaget_url text,
  ADD COLUMN IF NOT EXISTS market_price numeric,
  ADD COLUMN IF NOT EXISTS market_price_currency text DEFAULT 'SEK',
  ADD COLUMN IF NOT EXISTS market_price_source text,
  ADD COLUMN IF NOT EXISTS market_price_checked_at timestamp with time zone;