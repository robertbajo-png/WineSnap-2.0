-- Recommendation feedback and its structured Wine Memory signals.

CREATE TABLE public.recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wine_id uuid REFERENCES public.wines(id) ON DELETE SET NULL,
  candidate_key text NOT NULL CHECK (char_length(candidate_key) BETWEEN 1 AND 240),
  event_type text NOT NULL CHECK (
    event_type IN ('impression', 'open', 'save', 'like', 'dislike', 'dismiss', 'compare')
  ),
  source text NOT NULL CHECK (source IN ('for_you', 'similar', 'compare', 'ask')),
  candidate jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(candidate) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recommendation_events_user_recent_idx
  ON public.recommendation_events(user_id, created_at DESC);
CREATE INDEX recommendation_events_candidate_idx
  ON public.recommendation_events(user_id, candidate_key, event_type);
CREATE UNIQUE INDEX recommendation_events_single_feedback_idx
  ON public.recommendation_events(user_id, source, candidate_key)
  WHERE event_type IN ('like', 'dislike');

ALTER TABLE public.recommendation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recommendation_events FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.recommendation_events TO authenticated;
GRANT ALL ON public.recommendation_events TO service_role;

CREATE POLICY "Users read own recommendation events"
  ON public.recommendation_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own recommendation events"
  ON public.recommendation_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own recommendation events"
  ON public.recommendation_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_recommendation_feedback_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signal_direction text;
  signal_strength numeric;
  grape text;
  affected_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user := OLD.user_id;
    DELETE FROM public.taste_signals
    WHERE source = 'recommendation_feedback'
      AND context->>'recommendation_event_id' = OLD.id::text;
    PERFORM public.recompute_derived_preferences(affected_user);
    RETURN OLD;
  END IF;

  IF NEW.event_type NOT IN ('save', 'like', 'dislike', 'dismiss') THEN
    RETURN NEW;
  END IF;

  signal_direction := CASE
    WHEN NEW.event_type IN ('save', 'like') THEN 'like'
    WHEN NEW.event_type = 'dislike' THEN 'dislike'
    ELSE 'avoid'
  END;
  signal_strength := CASE NEW.event_type
    WHEN 'like' THEN 0.9
    WHEN 'save' THEN 0.75
    WHEN 'dislike' THEN 1.0
    ELSE 0.45
  END;

  INSERT INTO public.taste_signals (
    user_id, wine_id, source, attribute, direction, value_text,
    strength, confidence, evidence, context
  ) VALUES (
    NEW.user_id,
    NEW.wine_id,
    'recommendation_feedback',
    'overall',
    signal_direction,
    left(coalesce(NEW.candidate->>'wine_name', NEW.candidate_key), 120),
    signal_strength,
    1,
    'Recommendation feedback: ' || NEW.event_type,
    jsonb_build_object('recommendation_event_id', NEW.id, 'source', NEW.source)
  );

  INSERT INTO public.taste_signals (
    user_id, wine_id, source, attribute, direction, value_text,
    strength, confidence, evidence, context
  )
  SELECT
    NEW.user_id,
    NEW.wine_id,
    'recommendation_feedback',
    fact.attribute,
    signal_direction,
    left(fact.value, 120),
    signal_strength,
    0.9,
    'Recommendation feedback: ' || NEW.event_type,
    jsonb_build_object('recommendation_event_id', NEW.id, 'source', NEW.source)
  FROM (VALUES
    ('region', nullif(trim(NEW.candidate->>'region'), '')),
    ('wine_type', nullif(trim(NEW.candidate->>'wine_type'), '')),
    ('producer', nullif(trim(NEW.candidate->>'producer'), ''))
  ) AS fact(attribute, value)
  WHERE fact.value IS NOT NULL;

  IF jsonb_typeof(NEW.candidate->'grape_varieties') = 'array' THEN
    FOR grape IN SELECT jsonb_array_elements_text(NEW.candidate->'grape_varieties')
    LOOP
      IF length(trim(grape)) > 0 THEN
        INSERT INTO public.taste_signals (
          user_id, wine_id, source, attribute, direction, value_text,
          strength, confidence, evidence, context
        ) VALUES (
          NEW.user_id,
          NEW.wine_id,
          'recommendation_feedback',
          'grape',
          signal_direction,
          left(trim(grape), 120),
          signal_strength,
          0.9,
          'Recommendation feedback: ' || NEW.event_type,
          jsonb_build_object('recommendation_event_id', NEW.id, 'source', NEW.source)
        );
      END IF;
    END LOOP;
  END IF;

  PERFORM public.recompute_derived_preferences(NEW.user_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_recommendation_feedback_signals()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER recommendation_feedback_wine_memory
AFTER INSERT OR DELETE ON public.recommendation_events
FOR EACH ROW EXECUTE FUNCTION public.sync_recommendation_feedback_signals();
