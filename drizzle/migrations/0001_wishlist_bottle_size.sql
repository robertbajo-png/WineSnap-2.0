BEGIN;
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS bottle_ml integer;
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS retail_price_match jsonb;
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS last_checked_currency text CHECK (last_checked_currency IS NULL OR last_checked_currency = 'SEK');
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_bottle_ml_check CHECK (bottle_ml IS NULL OR bottle_ml BETWEEN 50 AND 30000);
COMMENT ON COLUMN public.wishlist.bottle_ml IS 'Explicit bottle size for verified retail matching; null is unknown, never assumed to be 750 ml.';
COMMENT ON COLUMN public.wishlist.last_checked_currency IS 'Verified quote currency, separate from target-price currency. Existing amounts are not converted or backfilled.';
COMMIT;
