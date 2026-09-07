-- Deploy the download-based frontend before this migration. Existing signed
-- tokens remain valid until expiry; this policy only prevents new issuance.
CREATE POLICY "Wine labels cannot issue bearer download links"
ON storage.objects AS RESTRICTIVE
FOR SELECT TO anon, authenticated
USING (
  bucket_id <> 'wine-labels'
  OR NOT storage.allow_any_operation(ARRAY[
    'object.sign', 'object.sign_many', 'render.image_sign'
  ])
);
