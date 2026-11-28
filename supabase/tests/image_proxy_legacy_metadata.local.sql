-- Synthetic regression fixture, run only by the isolated database checker.
-- Recreate the exact initial test policy so its guarded repair is exercised.
ALTER POLICY "Wine labels use revocable image proxy" ON storage.objects
  USING (
    bucket_id <> 'wine-labels'
    OR storage.allow_any_operation(ARRAY[
      'object.list', 'object.list_v2', 'object.get_authenticated_info',
      'object.head_authenticated_info', 'object.upload', 'object.upload_update',
      'object.delete', 'object.delete_many'
    ])
  );
