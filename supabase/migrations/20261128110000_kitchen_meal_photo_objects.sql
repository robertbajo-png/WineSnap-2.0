BEGIN;

ALTER TABLE public.kitchen_photo_meals ADD COLUMN photo_sha256 text;
ALTER TABLE public.kitchen_photo_meals ADD CONSTRAINT kitchen_meal_photo_digest_required CHECK (
  (photo_sha256 IS NULL OR (photo_sha256 ~ '^[0-9a-f]{64}$' AND photo_state IN ('pending', 'ready', 'removing')))
  AND (photo_state <> 'ready' OR photo_sha256 IS NOT NULL)
);
CREATE INDEX kitchen_photo_meals_live_object ON public.kitchen_photo_meals
  ((user_id::text || '/' || id::text || '.png')) WHERE photo_state IN ('pending', 'ready');

CREATE FUNCTION public.kitchen_photo_object_transition(_owner uuid, _meal uuid, _action text, _digest text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_state public.kitchen_photo_meals;
BEGIN
  IF _action IS NULL OR _action NOT IN ('pin', 'publish', 'begin_remove', 'finish_remove')
    OR (_action IN ('pin', 'publish') AND (_digest IS NULL OR _digest !~ '^[0-9a-f]{64}$'))
    OR (_action IN ('begin_remove', 'finish_remove') AND _digest IS NOT NULL) THEN
    RAISE EXCEPTION 'photo_transition_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT m.* INTO row_state FROM public.kitchen_photo_meals m
    WHERE m.user_id = _owner AND m.id = _meal FOR UPDATE;
  IF NOT FOUND OR NOT public.privacy_account_active(_owner) THEN RETURN 'unavailable'; END IF;

  IF _action = 'pin' THEN
    IF row_state.photo_state = 'ready' AND row_state.photo_sha256 = _digest THEN RETURN 'ready'; END IF;
    IF row_state.photo_state <> 'pending'
      OR (row_state.photo_sha256 IS NOT NULL AND row_state.photo_sha256 <> _digest) THEN
      RETURN 'conflict';
    END IF;
    UPDATE public.kitchen_photo_meals SET photo_sha256 = _digest WHERE user_id = _owner AND id = _meal;
    RETURN 'pending';
  ELSIF _action = 'publish' THEN
    IF row_state.photo_sha256 IS DISTINCT FROM _digest OR row_state.photo_state NOT IN ('pending', 'ready') THEN
      RETURN 'conflict';
    END IF;
    UPDATE public.kitchen_photo_meals SET photo_state = 'ready' WHERE user_id = _owner AND id = _meal;
    RETURN 'ready';
  ELSIF _action = 'begin_remove' THEN
    IF row_state.photo_state IN ('none', 'removed', 'removing') THEN RETURN row_state.photo_state; END IF;
    UPDATE public.kitchen_photo_meals SET photo_state = 'removing' WHERE user_id = _owner AND id = _meal;
    RETURN 'removing';
  ELSE
    IF row_state.photo_state = 'removed' THEN RETURN 'removed'; END IF;
    IF row_state.photo_state <> 'removing' THEN RETURN 'conflict'; END IF;
    UPDATE public.kitchen_photo_meals SET photo_state = 'removed', photo_sha256 = NULL
      WHERE user_id = _owner AND id = _meal;
    RETURN 'removed';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.kitchen_photo_object_transition(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_photo_object_transition(uuid, uuid, text, text) TO service_role;

-- A late Storage write cannot publish a removed photo. Such files are private and
-- eligible for the existing age-bounded Storage API cleanup when no row protects them.
CREATE OR REPLACE FUNCTION public.privacy_orphan_images(_limit integer DEFAULT 100)
RETURNS TABLE(bucket_id text, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.created_at < now() - interval '23 hours' AND (
    (o.bucket_id = 'wine-labels'
      AND NOT EXISTS (SELECT 1 FROM public.wine_photos p WHERE p.storage_path = o.name
        OR p.url = o.name OR split_part(split_part(p.url, '/wine-labels/', 2), '?', 1) = o.name)
      AND NOT EXISTS (SELECT 1 FROM public.wines w WHERE w.image_url = o.name
        OR split_part(split_part(w.image_url, '/wine-labels/', 2), '?', 1) = o.name))
    OR (o.bucket_id = 'meal-photos' AND NOT EXISTS (
      SELECT 1 FROM public.kitchen_photo_meals m
      WHERE m.photo_state IN ('pending', 'ready')
        AND o.name = m.user_id::text || '/' || m.id::text || '.png'
    ))
  )
  ORDER BY o.created_at, o.name LIMIT least(greatest(_limit, 1), 100);
$$;
REVOKE ALL ON FUNCTION public.privacy_orphan_images(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_orphan_images(integer) TO service_role;

COMMIT;
