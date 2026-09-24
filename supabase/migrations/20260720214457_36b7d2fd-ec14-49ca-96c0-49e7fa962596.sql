
ALTER TABLE public.wines
  ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE DEFAULT encode(gen_random_bytes(9), 'base64'),
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS wines_share_id_idx ON public.wines(share_id) WHERE is_public = true;

DROP POLICY IF EXISTS "Public wines are readable by anyone" ON public.wines;
CREATE POLICY "Public wines are readable by anyone"
  ON public.wines FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

GRANT SELECT ON public.wines TO anon;

CREATE TABLE IF NOT EXISTS public.restaurant_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_name TEXT,
  location TEXT,
  image_url TEXT,
  menu_text TEXT,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_scans TO authenticated;
GRANT ALL ON public.restaurant_scans TO service_role;

ALTER TABLE public.restaurant_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own restaurant scans"
  ON public.restaurant_scans FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS restaurant_scans_user_created_idx
  ON public.restaurant_scans(user_id, created_at DESC);

CREATE TRIGGER update_restaurant_scans_updated_at
  BEFORE UPDATE ON public.restaurant_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
