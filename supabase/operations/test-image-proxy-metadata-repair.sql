-- Manual repair only for empty WineSnap-test (pzniyupmgwvlldvztzqh).
-- Verify project identity outside SQL. This is NOT an automatic migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.wines)
    OR EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Expected empty approved test project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'wine-labels' AND NOT public)
    OR to_regprocedure('storage.allow_any_operation(text[])') IS NULL THEN
    RAISE EXCEPTION 'Expected private bucket and operation helper';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Wine labels use revocable image proxy'
      AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT'
      AND roles = ARRAY['anon', 'authenticated']::name[]
      AND qual = $policy$((bucket_id <> 'wine-labels'::text) OR storage.allow_any_operation(ARRAY['object.list'::text, 'object.list_v2'::text, 'object.get_authenticated_info'::text, 'object.head_authenticated_info'::text, 'object.upload'::text, 'object.upload_update'::text, 'object.delete'::text, 'object.delete_many'::text]))$policy$
  ) THEN
    RAISE EXCEPTION 'Expected exact original test policy; inspect instead of overwriting';
  END IF;
END $$;

-- The hosted CDN used GET object info to authorize direct image downloads.
ALTER POLICY "Wine labels use revocable image proxy" ON storage.objects
  USING (
    bucket_id <> 'wine-labels'
    OR storage.allow_any_operation(ARRAY[
      'object.list', 'object.list_v2', 'object.upload', 'object.upload_update',
      'object.delete', 'object.delete_many'
    ])
  );
COMMIT;
