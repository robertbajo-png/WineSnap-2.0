
CREATE TABLE public.wine_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID NOT NULL REFERENCES public.wines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  kind TEXT NOT NULL DEFAULT 'label' CHECK (kind IN ('label','bottle','context','hero')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wine_photos_wine_idx ON public.wine_photos(wine_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wine_photos TO authenticated;
GRANT ALL ON public.wine_photos TO service_role;
ALTER TABLE public.wine_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wine_photos" ON public.wine_photos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
