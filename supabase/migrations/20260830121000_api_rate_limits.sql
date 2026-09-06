CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(_bucket text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  max_requests integer;
  window_seconds integer;
  allowed boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT limits.max_requests, limits.window_seconds
  INTO max_requests, window_seconds
  FROM (
    VALUES
      ('analyze-wine', 20, 3600),
      ('restaurant-match', 10, 3600),
      ('taste-suggestions', 10, 3600),
      ('wine-suggestions', 20, 3600),
      ('systembolaget-match', 30, 3600),
      ('wishlist-price-check', 10, 3600)
  ) AS limits(bucket, max_requests, window_seconds)
  WHERE limits.bucket = _bucket;

  IF max_requests IS NULL THEN
    RAISE EXCEPTION 'Unknown rate-limit bucket';
  END IF;

  INSERT INTO public.api_rate_limits AS rate_limit (
    user_id,
    bucket,
    window_started_at,
    request_count
  )
  VALUES (current_user_id, _bucket, clock_timestamp(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
  SET
    request_count = CASE
      WHEN rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => window_seconds)
        THEN 1
      ELSE rate_limit.request_count + 1
    END,
    window_started_at = CASE
      WHEN rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => window_seconds)
        THEN clock_timestamp()
      ELSE rate_limit.window_started_at
    END
  RETURNING request_count <= max_requests INTO allowed;

  RETURN allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text) TO authenticated;

CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx
  ON public.api_rate_limits(window_started_at);
