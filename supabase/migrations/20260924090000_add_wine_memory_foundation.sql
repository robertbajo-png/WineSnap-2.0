-- Wine Memory foundation: structured evidence and deterministic preferences.

ALTER TABLE public.taste_profile
  ADD COLUMN IF NOT EXISTS signal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS memory_confidence numeric(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz;

CREATE TABLE public.taste_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wine_id uuid REFERENCES public.wines(id) ON DELETE CASCADE,
  tasting_note_id uuid REFERENCES public.tasting_notes(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (
    source IN ('tasting_note', 'explicit_profile', 'explicit_feedback', 'recommendation_feedback')
  ),
  attribute text NOT NULL CHECK (
    attribute IN (
      'overall', 'body', 'tannin', 'acidity', 'sweetness', 'oak', 'fruit',
      'aroma', 'grape', 'region', 'wine_type', 'producer', 'price', 'feedback'
    )
  ),
  direction text NOT NULL CHECK (
    direction IN ('like', 'dislike', 'prefer', 'avoid', 'too_high', 'too_low', 'neutral')
  ),
  value_text text,
  value_number numeric,
  strength numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
  confidence numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  evidence text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'dismissed')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX taste_signals_user_status_idx
  ON public.taste_signals(user_id, status, observed_at DESC);
CREATE INDEX taste_signals_note_idx
  ON public.taste_signals(tasting_note_id)
  WHERE tasting_note_id IS NOT NULL;
CREATE INDEX taste_signals_wine_idx
  ON public.taste_signals(wine_id)
  WHERE wine_id IS NOT NULL;

ALTER TABLE public.taste_signals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.taste_signals TO authenticated;
GRANT ALL ON public.taste_signals TO service_role;

CREATE POLICY "Users read own taste signals"
  ON public.taste_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER taste_signals_updated_at
BEFORE UPDATE ON public.taste_signals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.derived_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key text NOT NULL,
  attribute text NOT NULL,
  value_text text,
  value_number numeric,
  preference_score numeric(5,4) NOT NULL CHECK (preference_score BETWEEN -1 AND 1),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_count integer NOT NULL CHECK (evidence_count > 0),
  first_evidence_at timestamptz NOT NULL,
  last_evidence_at timestamptz NOT NULL,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, preference_key)
);

CREATE INDEX derived_preferences_user_rank_idx
  ON public.derived_preferences(user_id, confidence DESC, evidence_count DESC);

ALTER TABLE public.derived_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.derived_preferences TO authenticated;
GRANT ALL ON public.derived_preferences TO service_role;

CREATE POLICY "Users read own derived preferences"
  ON public.derived_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER derived_preferences_updated_at
BEFORE UPDATE ON public.derived_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_derived_preferences(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.derived_preferences WHERE user_id = _user_id;

  INSERT INTO public.derived_preferences (
    user_id,
    preference_key,
    attribute,
    value_text,
    value_number,
    preference_score,
    confidence,
    evidence_count,
    first_evidence_at,
    last_evidence_at,
    explanation,
    updated_at
  )
  WITH weighted AS (
    SELECT
      s.*,
      CASE s.direction
        WHEN 'like' THEN 1.0
        WHEN 'prefer' THEN 1.0
        WHEN 'dislike' THEN -1.0
        WHEN 'avoid' THEN -1.0
        WHEN 'too_high' THEN -0.75
        WHEN 'too_low' THEN -0.75
        ELSE 0.0
      END AS direction_score,
      greatest(
        0.25,
        exp(-ln(2.0) * greatest(0, extract(epoch FROM (now() - s.observed_at)) / 86400.0) / 365.0)
      ) AS recency_weight
    FROM public.taste_signals s
    WHERE s.user_id = _user_id
      AND s.status = 'active'
      AND s.attribute <> 'feedback'
  ), grouped AS (
    SELECT
      attribute,
      value_text,
      attribute || ':' || coalesce(lower(value_text), 'numeric') AS preference_key,
      sum(direction_score * strength * confidence * recency_weight)
        / nullif(sum(strength * confidence * recency_weight), 0) AS preference_score,
      sum(value_number * strength * confidence * recency_weight)
        / nullif(sum(strength * confidence * recency_weight) FILTER (WHERE value_number IS NOT NULL), 0)
        AS value_number,
      least(0.99, 1.0 - exp(-sum(confidence * recency_weight) / 2.0)) AS confidence,
      count(*)::integer AS evidence_count,
      min(observed_at) AS first_evidence_at,
      max(observed_at) AS last_evidence_at
    FROM weighted
    GROUP BY attribute, value_text
  )
  SELECT
    _user_id,
    preference_key,
    attribute,
    value_text,
    value_number,
    greatest(-1, least(1, coalesce(preference_score, 0))),
    greatest(0, least(1, confidence)),
    evidence_count,
    first_evidence_at,
    last_evidence_at,
    'Based on ' || evidence_count || CASE WHEN evidence_count = 1 THEN ' signal' ELSE ' signals' END,
    now()
  FROM grouped
  WHERE abs(coalesce(preference_score, 0)) >= 0.15
     OR value_number IS NOT NULL;

  UPDATE public.taste_profile tp
  SET
    signal_count = summary.signal_count,
    memory_confidence = summary.memory_confidence,
    last_signal_at = summary.last_signal_at,
    updated_at = now()
  FROM (
    SELECT
      count(*)::integer AS signal_count,
      coalesce(avg(confidence), 0)::numeric(4,3) AS memory_confidence,
      max(observed_at) AS last_signal_at
    FROM public.taste_signals
    WHERE user_id = _user_id AND status = 'active'
  ) summary
  WHERE tp.user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_derived_preferences(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_derived_preferences(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_tasting_note_signals(_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.tasting_notes%ROWTYPE;
  w public.wines%ROWTYPE;
  signal_direction text;
  signal_strength numeric;
BEGIN
  DELETE FROM public.taste_signals
  WHERE tasting_note_id = _note_id
    AND source IN ('tasting_note', 'explicit_feedback');

  SELECT * INTO n FROM public.tasting_notes WHERE id = _note_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO w
  FROM public.wines
  WHERE id = n.wine_id AND user_id = n.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tasting note and wine must belong to the same user';
  END IF;

  IF n.rating IS NOT NULL THEN
    signal_direction := CASE
      WHEN n.rating >= 4 THEN 'like'
      WHEN n.rating <= 2 THEN 'dislike'
      ELSE 'neutral'
    END;
    signal_strength := greatest(0.2, least(1.0, abs(n.rating - 3) / 2.0));

    INSERT INTO public.taste_signals (
      user_id, wine_id, tasting_note_id, source, attribute, direction,
      value_number, strength, confidence, evidence, observed_at
    ) VALUES (
      n.user_id, n.wine_id, n.id, 'tasting_note', 'overall', signal_direction,
      n.rating, signal_strength, 1, 'Rating: ' || n.rating || '/5', n.tasted_at::timestamptz
    );

    INSERT INTO public.taste_signals (
      user_id, wine_id, tasting_note_id, source, attribute, direction,
      value_number, strength, confidence, evidence, observed_at
    )
    SELECT
      n.user_id, n.wine_id, n.id, 'tasting_note', dimension.attribute,
      signal_direction, dimension.value, signal_strength, 0.9,
      dimension.attribute || ': ' || dimension.value || '/10', n.tasted_at::timestamptz
    FROM (VALUES
      ('body', n.body),
      ('tannin', n.tannin),
      ('acidity', n.acidity),
      ('sweetness', n.sweetness)
    ) AS dimension(attribute, value)
    WHERE dimension.value IS NOT NULL;

    IF signal_direction <> 'neutral' THEN
      INSERT INTO public.taste_signals (
        user_id, wine_id, tasting_note_id, source, attribute, direction,
        value_text, strength, confidence, evidence, observed_at
      )
      SELECT
        n.user_id, n.wine_id, n.id, 'tasting_note', 'aroma', signal_direction,
        aroma, signal_strength, 0.8, 'Aroma selected in tasting note', n.tasted_at::timestamptz
      FROM unnest(coalesce(n.aromas, '{}'::text[])) aroma
      WHERE length(trim(aroma)) > 0;

      INSERT INTO public.taste_signals (
        user_id, wine_id, tasting_note_id, source, attribute, direction,
        value_text, strength, confidence, evidence, observed_at
      )
      SELECT
        n.user_id, n.wine_id, n.id, 'tasting_note', wine_fact.attribute,
        signal_direction, wine_fact.value, signal_strength, 0.85,
        'Observed from rated wine', n.tasted_at::timestamptz
      FROM (VALUES
        ('region', w.region),
        ('wine_type', w.wine_type::text),
        ('producer', w.producer)
      ) AS wine_fact(attribute, value)
      WHERE wine_fact.value IS NOT NULL AND length(trim(wine_fact.value)) > 0;

      INSERT INTO public.taste_signals (
        user_id, wine_id, tasting_note_id, source, attribute, direction,
        value_text, strength, confidence, evidence, observed_at
      )
      SELECT
        n.user_id, n.wine_id, n.id, 'tasting_note', 'grape', signal_direction,
        grape, signal_strength, 0.85, 'Observed from rated wine', n.tasted_at::timestamptz
      FROM unnest(coalesce(w.grape_varieties, '{}'::text[])) grape
      WHERE length(trim(grape)) > 0;
    END IF;
  END IF;

  IF coalesce(length(trim(n.notes)), 0) > 0 THEN
    INSERT INTO public.taste_signals (
      user_id, wine_id, tasting_note_id, source, attribute, direction,
      confidence, evidence, status, observed_at
    ) VALUES (
      n.user_id, n.wine_id, n.id, 'explicit_feedback', 'feedback', 'neutral',
      1, left(trim(n.notes), 2000), 'pending', n.tasted_at::timestamptz
    );
  END IF;

  PERFORM public.recompute_derived_preferences(n.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tasting_note_signals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tasting_note_signals(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_profile_preference_signals(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  DELETE FROM public.taste_signals
  WHERE user_id = _user_id AND source = 'explicit_profile';

  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.taste_signals (
    user_id, source, attribute, direction, value_text, strength, confidence, evidence
  )
  SELECT p.id, 'explicit_profile', preference.attribute, 'prefer', preference.value, 1, 1,
    'Selected in Taste Profile'
  FROM (
    SELECT 'wine_type'::text AS attribute, unnest(coalesce(p.preferred_types, '{}'::text[])) AS value
    UNION ALL
    SELECT 'region', unnest(coalesce(p.preferred_regions, '{}'::text[]))
    UNION ALL
    SELECT 'grape', unnest(coalesce(p.preferred_grapes, '{}'::text[]))
  ) preference
  WHERE length(trim(preference.value)) > 0;

  INSERT INTO public.taste_signals (
    user_id, source, attribute, direction, value_number, strength, confidence, evidence
  )
  SELECT p.id, 'explicit_profile', dimension.attribute, 'prefer', dimension.value, 1, 1,
    'Set in Taste Profile'
  FROM (VALUES
    ('body', p.body::numeric),
    ('tannin', p.tannin::numeric),
    ('acidity', p.acidity::numeric),
    ('sweetness', p.sweetness::numeric),
    ('oak', p.oak::numeric)
  ) AS dimension(attribute, value)
  WHERE dimension.value IS NOT NULL;

  PERFORM public.recompute_derived_preferences(_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_preference_signals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_preference_signals(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_tasting_notes_wine_memory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user := OLD.user_id;
    DELETE FROM public.taste_signals WHERE tasting_note_id = OLD.id;
    PERFORM public.recompute_derived_preferences(affected_user);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.user_id <> NEW.user_id THEN
    DELETE FROM public.taste_signals WHERE tasting_note_id = OLD.id;
    PERFORM public.recompute_derived_preferences(OLD.user_id);
  END IF;

  PERFORM public.sync_tasting_note_signals(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_wine_memory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_profile_preference_signals(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_tasting_notes_wine_memory()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_profiles_wine_memory()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tasting_notes_wine_memory ON public.tasting_notes;
CREATE TRIGGER tasting_notes_wine_memory
AFTER INSERT OR UPDATE OR DELETE ON public.tasting_notes
FOR EACH ROW EXECUTE FUNCTION public.trg_tasting_notes_wine_memory();

DROP TRIGGER IF EXISTS profiles_wine_memory ON public.profiles;
CREATE TRIGGER profiles_wine_memory
AFTER UPDATE OF preferred_types, preferred_regions, preferred_grapes,
  body, tannin, acidity, sweetness, oak
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_wine_memory();

CREATE OR REPLACE FUNCTION public.replace_extracted_preference_signals(
  _user_id uuid,
  _tasting_note_id uuid,
  _signals jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  note_record public.tasting_notes%ROWTYPE;
BEGIN
  SELECT * INTO note_record
  FROM public.tasting_notes
  WHERE id = _tasting_note_id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tasting note not found'; END IF;
  IF jsonb_typeof(_signals) <> 'array' OR jsonb_array_length(_signals) > 12 THEN
    RAISE EXCEPTION 'Signals must be an array with at most 12 items';
  END IF;

  DELETE FROM public.taste_signals
  WHERE user_id = _user_id
    AND tasting_note_id = _tasting_note_id
    AND source = 'explicit_feedback'
    AND attribute <> 'feedback';

  FOR item IN SELECT * FROM jsonb_array_elements(_signals)
  LOOP
    IF coalesce(item->>'attribute', '') NOT IN (
      'overall', 'body', 'tannin', 'acidity', 'sweetness', 'oak', 'fruit',
      'aroma', 'grape', 'region', 'wine_type', 'producer', 'price'
    ) OR coalesce(item->>'direction', '') NOT IN (
      'like', 'dislike', 'prefer', 'avoid', 'too_high', 'too_low', 'neutral'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.taste_signals (
      user_id, wine_id, tasting_note_id, source, attribute, direction,
      value_text, value_number, strength, confidence, evidence, context,
      status, observed_at
    ) VALUES (
      _user_id,
      note_record.wine_id,
      note_record.id,
      'explicit_feedback',
      item->>'attribute',
      item->>'direction',
      nullif(left(trim(item->>'value_text'), 120), ''),
      CASE WHEN jsonb_typeof(item->'value_number') = 'number'
        THEN (item->>'value_number')::numeric ELSE NULL END,
      greatest(0, least(1, coalesce((item->>'strength')::numeric, 0.7))),
      greatest(0, least(1, coalesce((item->>'confidence')::numeric, 0.5))),
      left(coalesce(item->>'evidence', note_record.notes, ''), 500),
      jsonb_build_object('extractor', 'wine-memory-v1'),
      'active',
      note_record.tasted_at::timestamptz
    );
  END LOOP;

  UPDATE public.taste_signals
  SET status = 'dismissed', updated_at = now()
  WHERE user_id = _user_id
    AND tasting_note_id = _tasting_note_id
    AND source = 'explicit_feedback'
    AND attribute = 'feedback';

  PERFORM public.recompute_derived_preferences(_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_extracted_preference_signals(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_extracted_preference_signals(uuid, uuid, jsonb)
  TO service_role;

-- Backfill all existing explicit profile choices and tasting notes.
DO $$
DECLARE row_record record;
BEGIN
  FOR row_record IN SELECT id FROM public.profiles LOOP
    PERFORM public.sync_profile_preference_signals(row_record.id);
  END LOOP;
  FOR row_record IN SELECT id FROM public.tasting_notes ORDER BY created_at LOOP
    PERFORM public.sync_tasting_note_signals(row_record.id);
  END LOOP;
END
$$;
