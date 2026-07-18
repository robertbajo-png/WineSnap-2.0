
CREATE TABLE public.tasting_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  wine_id UUID NOT NULL REFERENCES public.wines(id) ON DELETE CASCADE,
  rating NUMERIC(3,1),
  aromas TEXT[] DEFAULT '{}'::text[],
  body NUMERIC(3,1),
  tannin NUMERIC(3,1),
  acidity NUMERIC(3,1),
  sweetness NUMERIC(3,1),
  finish TEXT,
  notes TEXT,
  location TEXT,
  tasted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasting_notes TO authenticated;
GRANT ALL ON public.tasting_notes TO service_role;

ALTER TABLE public.tasting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tasting notes"
  ON public.tasting_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX tasting_notes_wine_id_idx ON public.tasting_notes(wine_id);
CREATE INDEX tasting_notes_user_id_idx ON public.tasting_notes(user_id);

CREATE TRIGGER tasting_notes_updated_at
  BEFORE UPDATE ON public.tasting_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
