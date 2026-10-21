-- Manual, test-only gate for WineSnap-test (pzniyupmgwvlldvztzqh).
-- Deploy and verify wine-image plus its frontend flag BEFORE applying this.
-- This file is NOT an automatic migration. Verify project identity outside SQL.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.wines)
    OR EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Expected empty approved test project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'wine-labels' AND NOT public)
    OR to_regprocedure('storage.allow_any_operation(text[])') IS NULL
    OR to_regprocedure('public.privacy_account_active(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Expected private bucket and current security prerequisites';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'Wine labels use revocable image proxy') THEN
    RAISE EXCEPTION 'Policy exists; inspect instead of overwriting';
  END IF;
END $$;

-- Preserve the SELECT checks used by existing owner upload/delete/metadata APIs.
-- Unknown operations fail closed; no client download, signing, render or S3 read.
CREATE POLICY "Wine labels use revocable image proxy"
  ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    bucket_id <> 'wine-labels'
    OR storage.allow_any_operation(ARRAY[
      'object.list', 'object.list_v2', 'object.get_authenticated_info',
      'object.head_authenticated_info', 'object.upload', 'object.upload_update',
      'object.delete', 'object.delete_many'
    ])
  );
COMMIT;
