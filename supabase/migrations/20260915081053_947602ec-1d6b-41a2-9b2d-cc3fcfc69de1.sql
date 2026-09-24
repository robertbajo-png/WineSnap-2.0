ALTER TABLE public.tasting_notes
  ADD COLUMN IF NOT EXISTS aroma_intensities JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tasting_notes.aroma_intensities IS
  'User-authored aroma intensity values from 1 to 5, keyed by aroma name.';