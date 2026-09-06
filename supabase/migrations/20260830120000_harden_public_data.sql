BEGIN;

-- Public profile access must never expose private preference columns.
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are readable" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

REVOKE SELECT ON public.profiles FROM anon;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  bio,
  is_public,
  created_at
FROM public.profiles
WHERE is_public = true AND username IS NOT NULL;

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Public wine access is exposed through a column-limited view. The base table
-- remains available only through the existing owner policies.
DROP POLICY IF EXISTS "Public wines are readable by anyone" ON public.wines;
REVOKE SELECT ON public.wines FROM anon;

DROP VIEW IF EXISTS public.public_wines;
CREATE VIEW public.public_wines
WITH (security_barrier = true)
AS
SELECT
  id,
  user_id,
  image_url,
  producer,
  wine_name,
  vintage,
  grape_varieties,
  region,
  country,
  wine_type,
  description,
  fruit,
  tannin,
  acidity,
  oak,
  sweetness,
  body,
  primary_notes,
  secondary_notes,
  tertiary_notes,
  food_pairings,
  serving_temp,
  glass_type,
  decant,
  user_rating,
  created_at,
  share_id
FROM public.wines
WHERE is_public = true;

REVOKE ALL ON public.public_wines FROM PUBLIC;
GRANT SELECT ON public.public_wines TO anon, authenticated;

-- Preserve existing distributed links. Only new identifiers use URL-safe Base64.

ALTER TABLE public.wines
  ALTER COLUMN share_id
  SET DEFAULT translate(encode(gen_random_bytes(12), 'base64'), '+/=', '-_');

-- Keep cellar images private unless their wine has explicitly been shared.
UPDATE storage.buckets SET public = false WHERE id = 'wine-labels';

-- Older scans stored only the public object URL on wines. Link those objects to
-- their wine before public bucket access is removed so explicit shares keep working.
CREATE FUNCTION public._migration_decode_label_path(_value text)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  result bytea := ''::bytea;
  position integer := 1;
  token text;
BEGIN
  WHILE position <= length(_value) LOOP
    token := substring(_value FROM position FOR 3);
    IF token ~ '^%[0-9a-fA-F]{2}$' THEN
      result := result || decode(substring(token FROM 2), 'hex');
      position := position + 3;
    ELSE
      result := result || convert_to(substring(_value FROM position FOR 1), 'UTF8');
      position := position + 1;
    END IF;
  END LOOP;
  RETURN convert_from(result, 'UTF8');
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._migration_decode_label_path(text) FROM PUBLIC;

INSERT INTO public.wine_photos (wine_id, user_id, url, storage_path, kind, sort_order)
SELECT
  wine.id,
  wine.user_id,
  image.path,
  image.path,
  'label',
  0
FROM public.wines AS wine
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN wine.image_url LIKE '%/storage/v1/object/public/wine-labels/%'
      THEN public._migration_decode_label_path(split_part(split_part(
        split_part(wine.image_url, '/storage/v1/object/public/wine-labels/', 2), '?', 1), '#', 1))
    WHEN wine.image_url !~ '^https?://'
      THEN wine.image_url
    ELSE NULL
  END AS path
) AS image
WHERE image.path IS NOT NULL
  AND image.path <> ''
  AND (storage.foldername(image.path))[1] = wine.user_id::text
  AND NOT EXISTS (
    SELECT 1
    FROM public.wine_photos AS existing
    WHERE existing.wine_id = wine.id
      AND existing.storage_path = image.path
  );

DROP FUNCTION public._migration_decode_label_path(text);

DROP POLICY IF EXISTS "Wine labels are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Wine labels public read by direct path" ON storage.objects;
DROP POLICY IF EXISTS "Owners and shared wines can read labels" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_read_wine_label(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid()::text = (storage.foldername(_path))[1]
    OR EXISTS (
      SELECT 1
      FROM public.wine_photos AS photo
      JOIN public.wines AS wine ON wine.id = photo.wine_id
      WHERE photo.storage_path = _path
        AND wine.is_public = true
        AND photo.user_id = wine.user_id
        AND (storage.foldername(_path))[1] = wine.user_id::text
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_wine_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_wine_label(text) TO anon, authenticated;

CREATE POLICY "Owners and shared wines can read labels"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'wine-labels'
    AND public.can_read_wine_label(name)
  );

DROP POLICY IF EXISTS "own wine_photos" ON public.wine_photos;
CREATE POLICY "Owners manage their wine photos"
  ON public.wine_photos FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.wines AS wine
                WHERE wine.id = wine_id AND wine.user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.wines AS wine
                WHERE wine.id = wine_id AND wine.user_id = auth.uid())
    AND (storage_path IS NULL OR (storage.foldername(storage_path))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users manage own tasting notes" ON public.tasting_notes;
CREATE POLICY "Owners manage their wine tasting notes"
  ON public.tasting_notes FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.wines AS wine
                WHERE wine.id = wine_id AND wine.user_id = auth.uid())
  );

COMMIT;
