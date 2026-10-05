-- Transactional synthetic checks; run only in an isolated test database.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
  ('08000000-0000-4000-8000-000000000001','retail-owner@example.test'),
  ('08000000-0000-4000-8000-000000000002','retail-stranger@example.test');
INSERT INTO public.wines (id,user_id,wine_name,is_public,purchase_price,purchase_currency,market_price,market_price_currency,quantity)
VALUES ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8000-000000000001','Synthetic retail wine',false,100,'SEK',159,'SEK',2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wines WHERE id='08000000-0000-4000-8000-000000000003'
    AND retail_price_status='unverified' AND bottle_ml IS NULL AND retail_price_match IS NULL AND purchase_price=100 AND market_price=159) THEN
    RAISE EXCEPTION 'Legacy prices must be preserved without assuming volume or verification';
  END IF;
  BEGIN
    UPDATE public.wines SET bottle_ml=0 WHERE id='08000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Invalid volume accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.wines SET retail_price_status='invented' WHERE id='08000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Invalid status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','08000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.wines WHERE id='08000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'Stranger can read private retail metadata';
  END IF;
  UPDATE public.wines SET market_price=1,bottle_ml=1500 WHERE id='08000000-0000-4000-8000-000000000003';
  IF FOUND THEN RAISE EXCEPTION 'Stranger can write retail metadata'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','08000000-0000-4000-8000-000000000001',true);
UPDATE public.wines SET bottle_ml=750,retail_price_status='review',retail_price_attempted_at=now(),retail_price_candidates='{"candidates":[]}'::jsonb
WHERE id='08000000-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wines WHERE id='08000000-0000-4000-8000-000000000003' AND bottle_ml=750 AND purchase_price=100 AND market_price=159) THEN
    RAISE EXCEPTION 'Owner update changed historical prices';
  END IF;
END $$;
ROLLBACK;
SELECT 'Retail schema and owner isolation passed' AS result;
