
CREATE TABLE public.wishlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wine_id UUID REFERENCES public.wines(id) ON DELETE SET NULL,
  producer TEXT,
  wine_name TEXT NOT NULL,
  vintage INTEGER,
  region TEXT,
  country TEXT,
  grape_varieties TEXT[],
  wine_type TEXT,
  image_url TEXT,
  description TEXT,
  target_price NUMERIC(10,2),
  current_price NUMERIC(10,2),
  price_currency TEXT DEFAULT 'EUR',
  notify_on_drop BOOLEAN NOT NULL DEFAULT false,
  last_price_check TIMESTAMPTZ,
  priority SMALLINT NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  ai_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist TO authenticated;
GRANT ALL ON public.wishlist TO service_role;

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist" ON public.wishlist
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX wishlist_user_created_idx ON public.wishlist(user_id, created_at DESC);
CREATE UNIQUE INDEX wishlist_user_wine_uniq ON public.wishlist(user_id, wine_id) WHERE wine_id IS NOT NULL;

CREATE TRIGGER trg_wishlist_updated_at
  BEFORE UPDATE ON public.wishlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
