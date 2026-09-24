
ALTER TABLE public.wishlist
  ADD COLUMN IF NOT EXISTS last_checked_price numeric,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS systembolaget_id text,
  ADD COLUMN IF NOT EXISTS systembolaget_url text,
  ADD COLUMN IF NOT EXISTS price_alert_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_alert_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_source text;
