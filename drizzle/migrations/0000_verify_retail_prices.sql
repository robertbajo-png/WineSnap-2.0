BEGIN;
ALTER TABLE public.wines
  ADD COLUMN IF NOT EXISTS bottle_ml integer CHECK (bottle_ml BETWEEN 50 AND 30000),
  ADD COLUMN IF NOT EXISTS retail_price_status text NOT NULL DEFAULT 'unverified'
    CHECK (retail_price_status IN ('unverified', 'matched', 'review', 'missing', 'error')),
  ADD COLUMN IF NOT EXISTS retail_price_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retail_price_match jsonb,
  ADD COLUMN IF NOT EXISTS retail_price_candidates jsonb;

COMMENT ON COLUMN public.wines.bottle_ml IS 'Explicit bottle volume in ml; unknown is NULL, never assumed to be 750 ml.';
COMMENT ON COLUMN public.wines.retail_price_match IS 'Catalog product and wine identity verified automatically or confirmed by the owner; legacy prices are unverified.';
COMMENT ON COLUMN public.wines.retail_price_attempted_at IS 'Latest lookup attempt, separate from the last successful retail quote timestamp.';
COMMIT;
