BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cooking assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(query text, pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM !~ pattern THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'Expected cooking operation to fail';
END $$;
INSERT INTO auth.users(id,email) VALUES('a0000000-0000-4000-8000-000000000001','cook-owner@example.test'),('a0000000-0000-4000-8000-000000000002','cook-stranger@example.test');
SELECT set_config('test.recipe',jsonb_build_object('title','Synthetic soup','description','Fixture','servings',2,'totalMinutes',15,'image','none','sourceNote','Synthetic only','notes','',
 'ingredients',jsonb_build_array(jsonb_build_object('id','b0000000-0000-4000-8000-000000000001','name','Water','amount',300,'unit','ml')),
 'steps',jsonb_build_array(jsonb_build_object('id','b0000000-0000-4000-8000-000000000002','title','Heat','text','Synthetic instruction','timerSeconds',60)))::text,true);
SELECT set_config('test.state','{"status":"running","activeStep":0,"servings":3,"checkedIngredientIds":[],"timers":[]}',true);
SELECT pg_temp.assert_true(NOT kitchen_valid_recipe(NULL),'null recipe denied');
SELECT pg_temp.assert_true(NOT kitchen_valid_recipe(jsonb_set(current_setting('test.recipe')::jsonb,'{servings}','null')),'null servings denied');
SELECT pg_temp.assert_true(NOT kitchen_valid_state(NULL,current_setting('test.recipe')::jsonb),'null state denied');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.reject($q$SELECT public.kitchen_save_recipe('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,current_setting('test.recipe')::jsonb)$q$,'kitchen_unavailable');
RESET ROLE;
UPDATE public.kitchen_config SET enabled=true;
SET LOCAL ROLE authenticated;
SELECT public.kitchen_save_recipe('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,current_setting('test.recipe')::jsonb);
SELECT public.kitchen_save_recipe('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,current_setting('test.recipe')::jsonb);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM kitchen_recipe_versions),'idempotent recipe');
SELECT pg_temp.reject('UPDATE public.kitchen_recipe_versions SET document=''{}''','permission denied');
SELECT pg_temp.reject('UPDATE public.kitchen_config SET enabled=false','permission denied');
SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,'e0000000-0000-4000-8000-000000000001',current_setting('test.state')::jsonb);
SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,'e0000000-0000-4000-8000-000000000001',current_setting('test.state')::jsonb);
SELECT pg_temp.assert_true((SELECT revision=1 FROM cooking_sessions),'idempotent session');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',0,'e0000000-0000-4000-8000-000000000002',current_setting('test.state')::jsonb)$q$,'kitchen_conflict');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002',0,'e0000000-0000-4000-8000-000000000002',current_setting('test.state')::jsonb)$q$,'duplicate key');
SELECT public.kitchen_save_recipe('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003',1,jsonb_set(current_setting('test.recipe')::jsonb,'{title}','"New soup"'));
SELECT pg_temp.assert_true((SELECT recipe_version_id='c0000000-0000-4000-8000-000000000002' FROM cooking_sessions),'pinned recipe version');
SELECT pg_temp.assert_true((SELECT document->>'title'='Synthetic soup' FROM kitchen_recipe_versions WHERE revision=1),'immutable old content');
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM kitchen_recipe_versions),'stranger version isolation');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM cooking_sessions),'stranger session isolation');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000002',0,'e0000000-0000-4000-8000-000000000003',current_setting('test.state')::jsonb)$q$,'kitchen_not_found');
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',1,'e0000000-0000-4000-8000-000000000003',jsonb_set(current_setting('test.state')::jsonb,'{status}','"completed"'),'{"rating":4,"note":"Synthetic feedback"}');
SELECT pg_temp.assert_true((SELECT rating=4 FROM cooking_feedback),'feedback persisted');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_session('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',2,'e0000000-0000-4000-8000-000000000004',current_setting('test.state')::jsonb)$q$,'kitchen_finished');
RESET ROLE;
SELECT public.request_account_erasure('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM kitchen_recipes),'erasure blocks reads');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_recipe('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004',2,current_setting('test.recipe')::jsonb)$q$,'kitchen_unavailable');
RESET ROLE;
DELETE FROM auth.users WHERE id='a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM cooking_feedback),'erasure cascade feedback');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM kitchen_recipe_versions),'erasure cascade versions');
SET LOCAL ROLE anon;
SELECT pg_temp.reject('SELECT * FROM public.cooking_sessions','permission denied');
SELECT pg_temp.reject('SELECT public.kitchen_access()','permission denied');
RESET ROLE;
ROLLBACK;
SELECT 'cooking_core_acceptance_passed';
