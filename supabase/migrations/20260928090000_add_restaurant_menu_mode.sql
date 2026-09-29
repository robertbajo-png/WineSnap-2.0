-- Structured restaurant-menu sessions and recommendation feedback.

ALTER TABLE public.restaurant_scans
  ADD COLUMN constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN extracted_wines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN language text NOT NULL DEFAULT 'en';

ALTER TABLE public.restaurant_scans
  ADD CONSTRAINT restaurant_scans_constraints_object_check
    CHECK (jsonb_typeof(constraints) = 'object'),
  ADD CONSTRAINT restaurant_scans_extracted_wines_array_check
    CHECK (jsonb_typeof(extracted_wines) = 'array'),
  ADD CONSTRAINT restaurant_scans_language_check
    CHECK (language IN ('en', 'sv'));

COMMENT ON COLUMN public.restaurant_scans.image_url IS
  'Legacy field. New menu photos are processed transiently and are not stored as data URLs.';

ALTER TABLE public.recommendation_events
  DROP CONSTRAINT IF EXISTS recommendation_events_source_check;
ALTER TABLE public.recommendation_events
  ADD CONSTRAINT recommendation_events_source_check
  CHECK (source IN ('for_you', 'similar', 'compare', 'ask', 'social', 'restaurant'));
