-- Step 1 security foundation: private wine images and atomic AI quotas.

UPDATE storage.buckets
SET public = false
WHERE id = 'wine-labels';

-- Older scans stored only the public object URL on wines. Keep those images
-- connected to their wine so a public share can request a short-lived URL.
INSERT INTO public.wine_photos (wine_id, user_id, url, storage_path, kind, sort_order)
SELECT
  w.id,
  w.user_id,
  w.image_url,
  split_part(split_part(w.image_url, '/wine-labels/', 2), '?', 1),
  'label',
  0
FROM public.wines w
WHERE w.image_url LIKE '%/wine-labels/%'
  AND split_part(split_part(w.image_url, '/wine-labels/', 2), '?', 1) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.wine_photos wp
    WHERE wp.wine_id = w.id
      AND wp.storage_path = split_part(split_part(w.image_url, '/wine-labels/', 2), '?', 1)
  );

CREATE OR REPLACE FUNCTION public.is_public_wine_photo(_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wine_photos wp
    JOIN public.wines w ON w.id = wp.wine_id
    WHERE wp.storage_path = _storage_path
      AND w.is_public = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_wine_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_wine_photo(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Wine labels are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Wine labels public read by direct path" ON storage.objects;
DROP POLICY IF EXISTS "Wine labels owner or shared read" ON storage.objects;

CREATE POLICY "Wine labels owner or shared read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'wine-labels'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_public_wine_photo(name)
    )
  );

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, function_name, window_started_at)
);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  _user_id uuid,
  _function_name text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _count integer;
BEGIN
  IF _user_id IS NULL OR coalesce(length(trim(_function_name)), 0) = 0 THEN
    RAISE EXCEPTION 'user and function are required';
  END IF;
  IF _limit < 1 OR _window_seconds < 1 THEN
    RAISE EXCEPTION 'limit and window must be positive';
  END IF;

  _window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / _window_seconds) * _window_seconds
  );

  INSERT INTO public.ai_rate_limits AS limits (
    user_id,
    function_name,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (_user_id, _function_name, _window_start, 1, now())
  ON CONFLICT (user_id, function_name, window_started_at)
  DO UPDATE SET
    request_count = least(limits.request_count + 1, _limit + 1),
    updated_at = now()
  RETURNING request_count INTO _count;

  RETURN QUERY SELECT
    _count <= _limit,
    greatest(_limit - _count, 0),
    _window_start + make_interval(secs => _window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) TO service_role;

CREATE INDEX IF NOT EXISTS ai_rate_limits_updated_idx
  ON public.ai_rate_limits(updated_at);
