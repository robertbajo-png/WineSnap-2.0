BEGIN;
CREATE FUNCTION pg_temp.photo_meal_assert(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Meal photo assertion failed: %', label; END IF;
END;
$$;
CREATE FUNCTION pg_temp.photo_meal_reject(query text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected THEN RAISE; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected meal photo rejection with SQLSTATE %', expected;
END;
$$;

INSERT INTO auth.users(id, email) VALUES
  ('ba000000-0000-4000-8000-000000000001', 'photo-meal-owner@example.test'),
  ('ba000000-0000-4000-8000-000000000002', 'photo-meal-peer@example.test');
UPDATE public.kitchen_config SET enabled = true;
SELECT set_config('test.photo_owner', 'ba000000-0000-4000-8000-000000000001', true);
SELECT set_config('test.photo_peer', 'ba000000-0000-4000-8000-000000000002', true);
SELECT set_config('test.photo_plain_meal', 'bb000000-0000-4000-8000-000000000001', true);
SELECT set_config('test.photo_kept_meal', 'bb000000-0000-4000-8000-000000000002', true);
SELECT set_config('test.photo_items', '[{"name":"Ris","portion":{"source":"photo_estimate","range":{"minGrams":80,"maxGrams":140}}},{"name":"Bonor","portion":{"source":"manual","grams":120}},{"name":"Sallad","portion":null}]', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.photo_owner'), true);
SELECT pg_temp.photo_meal_assert((public.kitchen_save_photo_meal(
  current_setting('test.photo_plain_meal')::uuid, current_setting('test.photo_items')::jsonb, false
)).photo_state = 'none', 'saving without a photo does not allocate a photo');
SELECT pg_temp.photo_meal_assert((public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, current_setting('test.photo_items')::jsonb, true
)).photo_state = 'pending', 'optional photo starts pending, not attached');
SELECT pg_temp.photo_meal_assert((public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, current_setting('test.photo_items')::jsonb, true
)).items = current_setting('test.photo_items')::jsonb, 'exact retry preserves data');
SELECT pg_temp.photo_meal_assert((SELECT count(*) = 2 FROM public.kitchen_photo_meals), 'exact retry creates no extra meal');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_plain_meal')::uuid, current_setting('test.photo_items')::jsonb, true)$q$, 'PT409');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Other","portion":null}]', true)$q$, 'PT409');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[1]', true)$q$, '22023');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Ris","portion":{"source":"photo_estimate","range":42}}]', true)$q$, '22023');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Ris","portion":{"source":"photo_estimate","range":{"minGrams":140,"maxGrams":80}}}]', true)$q$, '22023');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Ris","portion":{"source":"manual","grams":10.5}}]', true)$q$, '22023');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Ris","portion":null,"photoUrl":"https://example.invalid"}]', true)$q$, '22023');
SELECT pg_temp.photo_meal_reject($q$UPDATE public.kitchen_photo_meals SET photo_state = 'ready'$q$, '42501');
SELECT pg_temp.photo_meal_reject($q$DELETE FROM public.kitchen_photo_meals$q$, '42501');

SELECT set_config('request.jwt.claim.sub', current_setting('test.photo_peer'), true);
SELECT pg_temp.photo_meal_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_photo_meals), 'peer sees no meals');
SELECT pg_temp.photo_meal_assert((public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, '[{"name":"Peer","portion":null}]', false
)).user_id = current_setting('test.photo_peer')::uuid, 'same id stays scoped to the peer');
RESET ROLE;

SELECT pg_temp.photo_meal_assert((SELECT NOT public FROM storage.buckets WHERE id = 'meal-photos'), 'separate bucket is private');
SET LOCAL ROLE service_role;
INSERT INTO storage.objects(bucket_id, name) VALUES
  ('meal-photos', current_setting('test.photo_owner') || '/' || current_setting('test.photo_kept_meal') || '.png'),
  ('meal-photos', current_setting('test.photo_peer') || '/peer.png');
SELECT pg_temp.photo_meal_assert((SELECT count(*) = 1 AND bool_and(
  name = current_setting('test.photo_owner') || '/' || current_setting('test.photo_kept_meal') || '.png'
) FROM public.privacy_account_storage_objects(current_setting('test.photo_owner')::uuid)
WHERE bucket_id = 'meal-photos'), 'service export and erasure discovery use ownership prefix');
RESET ROLE;

-- A permissive test policy must still not expose the private objects.
CREATE POLICY photo_meal_fixture_permissive ON storage.objects FOR ALL TO anon, authenticated
  USING (bucket_id = 'meal-photos') WITH CHECK (bucket_id = 'meal-photos');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.photo_owner'), true);
SELECT pg_temp.photo_meal_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id = 'meal-photos'), 'even owner must use the verified app path');
SELECT pg_temp.photo_meal_reject($q$INSERT INTO storage.objects(bucket_id, name)
  VALUES ('meal-photos', current_setting('test.photo_owner') || '/direct.png')$q$, '42501');
SELECT pg_temp.photo_meal_reject($q$SELECT * FROM public.privacy_account_storage_objects(
  current_setting('test.photo_owner')::uuid)$q$, '42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.photo_meal_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id = 'meal-photos'), 'anon cannot see meal photos');
SELECT pg_temp.photo_meal_reject('SELECT * FROM public.kitchen_photo_meals', '42501');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, current_setting('test.photo_items')::jsonb, true)$q$, '42501');
RESET ROLE;

SELECT public.request_account_erasure(current_setting('test.photo_owner')::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.photo_owner'), true);
SELECT pg_temp.photo_meal_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_photo_meals), 'pending erasure hides private meals');
SELECT pg_temp.photo_meal_reject($q$SELECT public.kitchen_save_photo_meal(
  current_setting('test.photo_kept_meal')::uuid, current_setting('test.photo_items')::jsonb, true)$q$, '42501');
RESET ROLE;
DELETE FROM auth.users WHERE id = current_setting('test.photo_owner')::uuid;
SELECT pg_temp.photo_meal_assert((SELECT count(*) = 1 AND bool_and(user_id = current_setting('test.photo_peer')::uuid)
  FROM public.kitchen_photo_meals), 'auth erasure cascades only the erased owner meals');

ROLLBACK;
SELECT 'kitchen_photo_meals_acceptance_passed';
