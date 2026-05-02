
-- Trigger: when a wine is inserted/updated/deleted, recompute the user's taste_profile aggregates.
CREATE OR REPLACE FUNCTION public.recompute_taste_profile(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
BEGIN
  SELECT count(*) INTO total FROM public.wines WHERE user_id = _user_id;

  INSERT INTO public.taste_profile AS tp (
    user_id, total_wines, avg_fruit, avg_tannin, avg_acidity, avg_oak, avg_sweetness, avg_body,
    favorite_grapes, favorite_regions, favorite_types, updated_at
  )
  SELECT
    _user_id,
    total,
    avg(fruit), avg(tannin), avg(acidity), avg(oak), avg(sweetness), avg(body),
    coalesce((
      SELECT jsonb_object_agg(g, c) FROM (
        SELECT unnest(grape_varieties) AS g, count(*) AS c
        FROM public.wines WHERE user_id = _user_id AND grape_varieties IS NOT NULL
        GROUP BY g ORDER BY c DESC LIMIT 10
      ) s
    ), '{}'::jsonb),
    coalesce((
      SELECT jsonb_object_agg(r, c) FROM (
        SELECT region AS r, count(*) AS c
        FROM public.wines WHERE user_id = _user_id AND region IS NOT NULL
        GROUP BY region ORDER BY c DESC LIMIT 10
      ) s
    ), '{}'::jsonb),
    coalesce((
      SELECT jsonb_object_agg(t, c) FROM (
        SELECT wine_type::text AS t, count(*) AS c
        FROM public.wines WHERE user_id = _user_id AND wine_type IS NOT NULL
        GROUP BY wine_type ORDER BY c DESC
      ) s
    ), '{}'::jsonb),
    now()
  FROM public.wines WHERE user_id = _user_id
  ON CONFLICT (user_id) DO UPDATE SET
    total_wines = EXCLUDED.total_wines,
    avg_fruit = EXCLUDED.avg_fruit,
    avg_tannin = EXCLUDED.avg_tannin,
    avg_acidity = EXCLUDED.avg_acidity,
    avg_oak = EXCLUDED.avg_oak,
    avg_sweetness = EXCLUDED.avg_sweetness,
    avg_body = EXCLUDED.avg_body,
    favorite_grapes = EXCLUDED.favorite_grapes,
    favorite_regions = EXCLUDED.favorite_regions,
    favorite_types = EXCLUDED.favorite_types,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_wines_recompute_taste()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_taste_profile(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_taste_profile(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS wines_recompute_taste ON public.wines;
CREATE TRIGGER wines_recompute_taste
AFTER INSERT OR UPDATE OR DELETE ON public.wines
FOR EACH ROW EXECUTE FUNCTION public.trg_wines_recompute_taste();

-- Make sure taste_profile has unique constraint on user_id (needed for ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.taste_profile'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.taste_profile ADD PRIMARY KEY (user_id);
  END IF;
END $$;
