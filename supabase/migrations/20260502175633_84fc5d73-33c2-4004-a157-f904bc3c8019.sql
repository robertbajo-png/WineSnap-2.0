ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_regions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_grapes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body smallint,
  ADD COLUMN IF NOT EXISTS sweetness smallint,
  ADD COLUMN IF NOT EXISTS oak smallint,
  ADD COLUMN IF NOT EXISTS tannin smallint,
  ADD COLUMN IF NOT EXISTS acidity smallint,
  ADD COLUMN IF NOT EXISTS price_min integer,
  ADD COLUMN IF NOT EXISTS price_max integer;