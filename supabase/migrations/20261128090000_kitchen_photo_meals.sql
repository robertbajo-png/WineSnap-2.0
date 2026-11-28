BEGIN;

CREATE FUNCTION public.valid_kitchen_photo_meal_items(_items jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  item jsonb;
  portion jsonb;
  quantity numeric;
  min_quantity numeric;
  max_quantity numeric;
BEGIN
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR pg_column_size(_items) > 24000 THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(_items) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF jsonb_typeof(item) <> 'object' THEN RETURN false; END IF;
    IF NOT (item ?& ARRAY['name', 'portion'])
      OR item - ARRAY['name', 'portion'] <> '{}'::jsonb
      OR jsonb_typeof(item->'name') <> 'string'
      OR char_length(btrim(item->>'name')) NOT BETWEEN 1 AND 100
      OR item->>'name' ~ '[[:cntrl:]]'
      OR item->>'name' <> btrim(item->>'name') THEN
      RETURN false;
    END IF;
    portion := item->'portion';
    IF portion = 'null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(portion) <> 'object' THEN RETURN false; END IF;
    CASE portion->>'source'
      WHEN 'manual' THEN
        IF jsonb_typeof(portion->'grams') IS DISTINCT FROM 'number'
          OR portion - ARRAY['source', 'grams'] <> '{}'::jsonb THEN
          RETURN false;
        END IF;
        quantity := (portion->>'grams')::numeric;
        IF quantity NOT BETWEEN 1 AND 10000 OR quantity <> trunc(quantity) THEN RETURN false; END IF;
      WHEN 'photo_estimate' THEN
        IF jsonb_typeof(portion->'range') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
        IF portion - ARRAY['source', 'range'] <> '{}'::jsonb
          OR (portion->'range') - ARRAY['minGrams', 'maxGrams'] <> '{}'::jsonb
          OR jsonb_typeof(portion->'range'->'minGrams') IS DISTINCT FROM 'number'
          OR jsonb_typeof(portion->'range'->'maxGrams') IS DISTINCT FROM 'number' THEN
          RETURN false;
        END IF;
        min_quantity := (portion->'range'->>'minGrams')::numeric;
        max_quantity := (portion->'range'->>'maxGrams')::numeric;
        IF min_quantity < 1 OR max_quantity > 10000 OR min_quantity >= max_quantity
          OR min_quantity <> trunc(min_quantity) OR max_quantity <> trunc(max_quantity) THEN
          RETURN false;
        END IF;
      ELSE RETURN false;
    END CASE;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_kitchen_photo_meal_items(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_kitchen_photo_meal_items(jsonb) TO service_role;

CREATE TABLE public.kitchen_photo_meals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  items jsonb NOT NULL CHECK (public.valid_kitchen_photo_meal_items(items)),
  keep_photo boolean NOT NULL,
  photo_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (
    (NOT keep_photo AND photo_state = 'none')
    OR (keep_photo AND photo_state IN ('pending', 'ready', 'removing', 'removed'))
  )
);
CREATE INDEX kitchen_photo_meals_recent ON public.kitchen_photo_meals(user_id, created_at DESC, id);
ALTER TABLE public.kitchen_photo_meals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_photo_meals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kitchen_photo_meals TO authenticated;
GRANT ALL ON public.kitchen_photo_meals TO service_role;
CREATE POLICY kitchen_photo_meals_owner_read ON public.kitchen_photo_meals
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.kitchen_access());

CREATE FUNCTION public.kitchen_save_photo_meal(_id uuid, _items jsonb, _keep_photo boolean)
RETURNS public.kitchen_photo_meals LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := auth.uid();
  saved public.kitchen_photo_meals;
BEGIN
  IF v_owner IS NULL OR NOT public.kitchen_access() THEN
    RAISE EXCEPTION 'photo_meal_denied' USING ERRCODE = '42501';
  END IF;
  IF _id IS NULL OR _keep_photo IS NULL OR NOT public.valid_kitchen_photo_meal_items(_items) THEN
    RAISE EXCEPTION 'photo_meal_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kitchen_photo_meals (user_id, id, items, keep_photo, photo_state)
  VALUES (v_owner, _id, _items, _keep_photo, CASE WHEN _keep_photo THEN 'pending' ELSE 'none' END)
  ON CONFLICT (user_id, id) DO NOTHING;
  SELECT m.* INTO saved FROM public.kitchen_photo_meals m WHERE m.user_id = v_owner AND m.id = _id;
  IF NOT FOUND OR saved.items IS DISTINCT FROM _items OR saved.keep_photo IS DISTINCT FROM _keep_photo THEN
    RAISE EXCEPTION 'photo_meal_conflict' USING ERRCODE = 'PT409';
  END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.kitchen_save_photo_meal(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_save_photo_meal(uuid, jsonb, boolean) TO authenticated;

INSERT INTO storage.buckets (id, name, public) VALUES ('meal-photos', 'meal-photos', false);
-- No direct read, signing, upload or mutation for clients, even with another permissive policy.
CREATE POLICY meal_photos_service_only ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (bucket_id <> 'meal-photos')
  WITH CHECK (bucket_id <> 'meal-photos');

-- Service uploads need not set Storage's owner fields. The app assigns the owner prefix.
CREATE OR REPLACE FUNCTION public.privacy_account_storage_objects(_user_id uuid, _limit integer DEFAULT 200)
RETURNS TABLE(bucket_id text, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.owner_id = _user_id::text OR o.owner::text = _user_id::text
    OR (o.bucket_id IN ('wine-labels', 'meal-photos') AND split_part(o.name, '/', 1) = _user_id::text)
  ORDER BY o.bucket_id, o.name LIMIT least(greatest(_limit, 1), 501);
$$;
REVOKE ALL ON FUNCTION public.privacy_account_storage_objects(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_account_storage_objects(uuid, integer) TO service_role;

COMMIT;
