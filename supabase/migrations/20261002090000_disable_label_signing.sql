-- Deploy the download-based frontend BEFORE applying this policy in production.
-- Previously issued signed tokens remain valid until their original expiry.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Wine labels cannot issue bearer download links'
  ) THEN
    CREATE POLICY "Wine labels cannot issue bearer download links"
    ON storage.objects AS RESTRICTIVE
    FOR SELECT TO anon, authenticated
    USING (
      bucket_id <> 'wine-labels'
      OR NOT storage.allow_any_operation(ARRAY[
        'object.sign', 'object.sign_many', 'render.image_sign'
      ])
    );
  END IF;
END
$$;
