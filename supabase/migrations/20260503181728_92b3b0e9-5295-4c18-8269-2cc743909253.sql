ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personalized_recs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_arrivals_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_disliked boolean NOT NULL DEFAULT true;