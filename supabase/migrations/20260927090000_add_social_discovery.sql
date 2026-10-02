-- Privacy-preserving taste similarity and personalized social discovery.

CREATE TABLE public.user_taste_similarity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  similarity_score numeric(5,4) NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  shared_preference_count integer NOT NULL CHECK (shared_preference_count > 0),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_user_id),
  CHECK (user_id <> peer_user_id)
);

CREATE INDEX user_taste_similarity_rank_idx
  ON public.user_taste_similarity(user_id, confidence DESC, similarity_score DESC);

ALTER TABLE public.user_taste_similarity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_taste_similarity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_taste_similarity TO authenticated;
GRANT ALL ON public.user_taste_similarity TO service_role;

CREATE POLICY "Users read own taste similarities"
  ON public.user_taste_similarity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.refresh_my_taste_similarities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  refreshed_count integer := 0;
BEGIN
  IF viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Prevent concurrent discovery calls from replacing the same user's rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(viewer_id::text, 0));
  SELECT count(*)::integer
  INTO refreshed_count
  FROM public.user_taste_similarity similarity
  WHERE similarity.user_id = viewer_id
    AND similarity.calculated_at >= now() - interval '5 minutes'
    AND similarity.calculated_at >= coalesce(
      (
        SELECT max(preference.updated_at)
        FROM public.derived_preferences preference
        WHERE preference.user_id = viewer_id
      ),
      '-infinity'::timestamptz
    );
  IF refreshed_count > 0 THEN
    RETURN refreshed_count;
  END IF;

  DELETE FROM public.user_taste_similarity WHERE user_id = viewer_id;

  INSERT INTO public.user_taste_similarity (
    user_id,
    peer_user_id,
    similarity_score,
    confidence,
    shared_preference_count,
    calculated_at
  )
  WITH matches AS (
    SELECT
      peer.user_id AS peer_user_id,
      count(*)::integer AS shared_count,
      sum(
        (1 - least(2, abs(mine.preference_score - peer.preference_score)) / 2)
        * least(mine.confidence, peer.confidence)
      ) / nullif(sum(least(mine.confidence, peer.confidence)), 0) AS score,
      avg(least(mine.confidence, peer.confidence)) AS evidence_confidence
    FROM public.derived_preferences mine
    JOIN public.derived_preferences peer
      ON peer.preference_key = mine.preference_key
     AND peer.user_id <> viewer_id
    JOIN public.profiles profile
      ON profile.id = peer.user_id
     AND profile.is_public = true
    WHERE mine.user_id = viewer_id
      AND mine.confidence >= 0.35
      AND peer.confidence >= 0.35
    GROUP BY peer.user_id
  )
  SELECT
    viewer_id,
    matches.peer_user_id,
    greatest(0, least(1, coalesce(matches.score, 0))),
    greatest(
      0,
      least(0.95, matches.evidence_confidence * least(1, matches.shared_count / 6.0))
    ),
    matches.shared_count,
    now()
  FROM matches
  WHERE matches.shared_count >= 2;

  GET DIAGNOSTICS refreshed_count = ROW_COUNT;
  RETURN refreshed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_my_taste_similarities()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_taste_similarities()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_discovery(_limit integer DEFAULT 20)
RETURNS TABLE (
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_following boolean,
  similarity_score numeric,
  similarity_confidence numeric,
  shared_preference_count integer,
  recent_public_wines bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  viewer_id uuid := auth.uid();
BEGIN
  IF viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_my_taste_similarities();

  RETURN QUERY
  SELECT
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.bio,
    EXISTS (
      SELECT 1 FROM public.follows follow_row
      WHERE follow_row.follower_id = viewer_id
        AND follow_row.following_id = profile.id
    ),
    similarity.similarity_score,
    similarity.confidence,
    coalesce(similarity.shared_preference_count, 0),
    (
      SELECT count(*)
      FROM public.wines wine
      WHERE wine.user_id = profile.id
        AND wine.is_public = true
        AND wine.created_at >= now() - interval '180 days'
    )
  FROM public.profiles profile
  LEFT JOIN public.user_taste_similarity similarity
    ON similarity.user_id = viewer_id
   AND similarity.peer_user_id = profile.id
  WHERE profile.is_public = true
    AND profile.id <> viewer_id
  ORDER BY
    8 DESC NULLS LAST,
    7 DESC NULLS LAST,
    10 DESC,
    3 NULLS LAST
  LIMIT greatest(1, least(coalesce(_limit, 20), 50));
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_discovery(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_discovery(integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_wine_discovery(_limit integer DEFAULT 30)
RETURNS TABLE (
  wine_id uuid,
  producer text,
  wine_name text,
  vintage integer,
  region text,
  country text,
  wine_type public.wine_type,
  grape_varieties text[],
  image_url text,
  share_id text,
  user_rating smallint,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  is_following boolean,
  taste_similarity numeric,
  similarity_confidence numeric,
  shared_preference_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  viewer_id uuid := auth.uid();
BEGIN
  IF viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_my_taste_similarities();

  RETURN QUERY
  WITH candidates AS (
    SELECT
      wine.id,
      wine.producer,
      wine.wine_name,
      wine.vintage,
      wine.region,
      wine.country,
      wine.wine_type,
      wine.grape_varieties,
      wine.image_url,
      wine.share_id,
      wine.user_rating,
      wine.created_at,
      profile.id AS author_id,
      profile.username AS author_username,
      profile.display_name AS author_display_name,
      EXISTS (
        SELECT 1 FROM public.follows follow_row
        WHERE follow_row.follower_id = viewer_id
          AND follow_row.following_id = profile.id
      ) AS is_following,
      similarity.similarity_score,
      similarity.confidence,
      coalesce(similarity.shared_preference_count, 0) AS shared_count
    FROM public.wines wine
    JOIN public.profiles profile
      ON profile.id = wine.user_id
     AND profile.is_public = true
    LEFT JOIN public.user_taste_similarity similarity
      ON similarity.user_id = viewer_id
     AND similarity.peer_user_id = profile.id
    WHERE wine.is_public = true
      AND wine.user_id <> viewer_id
      AND wine.share_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.follows follow_row
          WHERE follow_row.follower_id = viewer_id
            AND follow_row.following_id = profile.id
        )
        OR similarity.confidence >= 0.2
      )
  )
  SELECT
    candidates.id,
    candidates.producer,
    candidates.wine_name,
    candidates.vintage,
    candidates.region,
    candidates.country,
    candidates.wine_type,
    candidates.grape_varieties,
    candidates.image_url,
    candidates.share_id,
    candidates.user_rating,
    candidates.created_at,
    candidates.author_id,
    candidates.author_username,
    candidates.author_display_name,
    candidates.is_following,
    candidates.similarity_score,
    candidates.confidence,
    candidates.shared_count
  FROM candidates
  ORDER BY
    candidates.is_following DESC,
    candidates.confidence DESC NULLS LAST,
    candidates.similarity_score DESC NULLS LAST,
    candidates.user_rating DESC NULLS LAST,
    candidates.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 30), 60));
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_wine_discovery(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_wine_discovery(integer)
  TO authenticated;

ALTER TABLE public.recommendation_events
  DROP CONSTRAINT IF EXISTS recommendation_events_source_check;
ALTER TABLE public.recommendation_events
  ADD CONSTRAINT recommendation_events_source_check
  CHECK (source IN ('for_you', 'similar', 'compare', 'ask', 'social'));
