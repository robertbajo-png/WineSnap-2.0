DROP POLICY IF EXISTS "Follows are readable by everyone" ON public.follows;
CREATE POLICY "Follows readable by authenticated users"
ON public.follows FOR SELECT TO authenticated
USING (
  follower_id = auth.uid()
  OR following_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.follows.following_id AND p.is_public = true)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.follows.follower_id AND p.is_public = true)
);
REVOKE SELECT ON public.follows FROM anon;