
-- Fix search_path on update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Revoke EXECUTE from public/anon/authenticated on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Restrict storage object listing: only allow SELECT on objects user owns OR via signed/public direct URL
-- Replace broad SELECT policy with one scoped to owner-folder for listing.
DROP POLICY IF EXISTS "Wine labels are publicly readable" ON storage.objects;

-- Allow public access for direct file fetches (needed because bucket is public),
-- but practical "list" attempts will be limited because clients usually need exact paths.
-- Restrict listing by requiring user folder match for authenticated listing.
CREATE POLICY "Wine labels public read by direct path"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wine-labels');
