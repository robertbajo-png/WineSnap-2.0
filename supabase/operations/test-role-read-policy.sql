-- Operator-approved repair ONLY for empty WineSnap-test (pzniyupmgwvlldvztzqh).
-- Verify the selected project outside SQL. Never include in automatic deployments.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.wines)
    OR EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Expected empty approved test project';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261010210000', '20261013180000')) <> 2 THEN
    RAISE EXCEPTION 'Expected approved security migrations first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_roles' AND policyname='Admins can view all roles') THEN
    RAISE EXCEPTION 'Policy already exists; inspect instead of overwriting';
  END IF;
END $$;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
COMMIT;
