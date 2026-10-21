-- The operator policy is applied only to the isolated synthetic cluster first.
BEGIN;
INSERT INTO auth.users(id, email) VALUES
 ('55555555-5555-4555-8555-555555555551', 'image-owner@example.test'),
 ('55555555-5555-4555-8555-555555555552', 'image-peer@example.test');
INSERT INTO public.wines(id, user_id, wine_name, is_public, share_id) VALUES
 ('55555555-5555-4555-8555-555555555553', '55555555-5555-4555-8555-555555555551', 'Synthetic shared image', true, 'synthetic-proxy-share');
INSERT INTO storage.objects(bucket_id, name, owner, owner_id) VALUES
 ('wine-labels', '55555555-5555-4555-8555-555555555551/shared.png', '55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555551'),
 ('wine-labels', '55555555-5555-4555-8555-555555555552/private.png', '55555555-5555-4555-8555-555555555552', '55555555-5555-4555-8555-555555555552');
INSERT INTO public.wine_photos(wine_id, user_id, url, storage_path, kind) VALUES
 ('55555555-5555-4555-8555-555555555553', '55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555551/shared.png', '55555555-5555-4555-8555-555555555551/shared.png', 'label');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555551', true);
DO $$ DECLARE op text; BEGIN
  FOREACH op IN ARRAY ARRAY['object.get_authenticated', 'storage.object.get_authenticated',
    'render.image_authenticated', 'render.image_public', 'render.image_sign',
    'object.sign', 'object.sign_many', 's3.object.get', 'future.download', ''] LOOP
    PERFORM set_config('test.storage_operation', op, true);
    IF EXISTS (SELECT 1 FROM storage.objects) THEN
      RAISE EXCEPTION 'Client image bytes must only use proxy';
    END IF;
  END LOOP;
  FOREACH op IN ARRAY ARRAY['object.list', 'storage.object.list', 'object.get_authenticated_info',
    'object.delete', 'object.delete_many', 'object.upload', 'object.upload_update'] LOOP
    PERFORM set_config('test.storage_operation', op, true);
    IF (SELECT count(*) FROM storage.objects) <> 1 THEN
      RAISE EXCEPTION 'Owner metadata/mutation SELECT check regressed';
    END IF;
  END LOOP;
END $$;
SELECT set_config('test.storage_operation', 'object.upload', true);
INSERT INTO storage.objects(bucket_id, name, owner, owner_id) VALUES
 ('wine-labels', '55555555-5555-4555-8555-555555555551/temporary.png', '55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555551');
SELECT set_config('test.storage_operation', 'object.delete_many', true);
DO $$ BEGIN
  DELETE FROM storage.objects WHERE name = '55555555-5555-4555-8555-555555555552/private.png';
  IF FOUND THEN RAISE EXCEPTION 'Owner can remove a peer image'; END IF;
END $$;
DELETE FROM storage.objects WHERE name = '55555555-5555-4555-8555-555555555551/temporary.png';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/temporary.png') THEN
    RAISE EXCEPTION 'Owner image removal failed';
  END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('test.storage_operation', 'object.get_authenticated', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'Anonymous direct download allowed'; END IF;
  IF (SELECT count(*) FROM public.wines WHERE share_id = 'synthetic-proxy-share') <> 1 THEN
    RAISE EXCEPTION 'Public wine lookup regressed';
  END IF;
  IF NOT public.is_public_wine_photo('55555555-5555-4555-8555-555555555551/shared.png') THEN
    RAISE EXCEPTION 'Proxy public-image authorization regressed';
  END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 2 THEN RAISE EXCEPTION 'Service proxy access regressed'; END IF;
END $$;
RESET ROLE;

-- The new restrictive rule must not alter another bucket's existing policy.
INSERT INTO storage.buckets(id, name, public) VALUES ('synthetic-other', 'synthetic-other', false);
INSERT INTO storage.objects(bucket_id, name) VALUES ('synthetic-other', 'example.png');
CREATE POLICY "Synthetic other bucket" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'synthetic-other');
SET LOCAL ROLE anon;
SELECT set_config('test.storage_operation', 'object.get_authenticated', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'synthetic-other') <> 1 THEN
    RAISE EXCEPTION 'Unrelated bucket read regressed';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
