
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.wine_type AS ENUM ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'orange', 'unknown');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ WINES ============
CREATE TABLE public.wines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT,
  producer TEXT,
  wine_name TEXT,
  vintage INTEGER,
  grape_varieties TEXT[],
  region TEXT,
  country TEXT,
  wine_type public.wine_type DEFAULT 'unknown',
  description TEXT,
  -- smakprofil 0-10
  fruit SMALLINT,
  tannin SMALLINT,
  acidity SMALLINT,
  oak SMALLINT,
  sweetness SMALLINT,
  body SMALLINT,
  -- aromnoter (pyramid)
  primary_notes TEXT[],
  secondary_notes TEXT[],
  tertiary_notes TEXT[],
  -- matparning
  food_pairings JSONB,
  -- servering
  serving_temp TEXT,
  glass_type TEXT,
  decant BOOLEAN,
  -- fullt AI-svar
  ai_raw JSONB,
  user_rating SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wines" ON public.wines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wines" ON public.wines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wines" ON public.wines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wines" ON public.wines FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_wines_user_created ON public.wines(user_id, created_at DESC);
CREATE INDEX idx_wines_type ON public.wines(wine_type);

-- ============ TASTE PROFILE ============
CREATE TABLE public.taste_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_grapes JSONB DEFAULT '{}'::jsonb,
  favorite_regions JSONB DEFAULT '{}'::jsonb,
  favorite_types JSONB DEFAULT '{}'::jsonb,
  avg_fruit NUMERIC,
  avg_tannin NUMERIC,
  avg_acidity NUMERIC,
  avg_oak NUMERIC,
  avg_sweetness NUMERIC,
  avg_body NUMERIC,
  total_wines INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.taste_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own taste profile" ON public.taste_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own taste profile" ON public.taste_profile FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ TIMESTAMP TRIGGERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER wines_updated_at BEFORE UPDATE ON public.wines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER taste_profile_updated_at BEFORE UPDATE ON public.taste_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ AUTO-CREATE PROFILE & ROLE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.taste_profile (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('wine-labels', 'wine-labels', true);

CREATE POLICY "Wine labels are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'wine-labels');
CREATE POLICY "Authenticated users can upload wine labels" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'wine-labels' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own wine labels" ON storage.objects
  FOR UPDATE USING (bucket_id = 'wine-labels' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own wine labels" ON storage.objects
  FOR DELETE USING (bucket_id = 'wine-labels' AND auth.uid()::text = (storage.foldername(name))[1]);
