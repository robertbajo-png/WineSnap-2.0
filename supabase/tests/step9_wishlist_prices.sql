BEGIN;
INSERT INTO auth.users (id,email) VALUES ('09000000-0000-4000-8000-000000000001','wishlist-owner@example.test'), ('09000000-0000-4000-8000-000000000002','wishlist-stranger@example.test');
INSERT INTO public.wishlist (id,user_id,wine_name) VALUES ('09000000-0000-4000-8000-000000000003','09000000-0000-4000-8000-000000000001','Synthetic wishlist wine');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wishlist WHERE id='09000000-0000-4000-8000-000000000003' AND bottle_ml IS NULL AND last_checked_currency IS NULL AND retail_price_match IS NULL AND price_currency='EUR') THEN RAISE EXCEPTION 'Unknown size/quote and legacy target currency must remain unchanged'; END IF;
  BEGIN
    UPDATE public.wishlist SET bottle_ml=0 WHERE id='09000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Invalid bottle size accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','09000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.wishlist WHERE id='09000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Other user read a private wishlist'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
