BEGIN;
CREATE FUNCTION pg_temp.pantry_assert(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Pantry assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.pantry_reject(query text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'Expected rejection with SQLSTATE %',expected;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('ab000000-0000-4000-8000-000000000001','pantry-owner@example.test'),
 ('ab000000-0000-4000-8000-000000000002','pantry-peer@example.test');
UPDATE public.kitchen_config SET enabled=true;
SELECT set_config('test.pantry_item','aa000000-0000-4000-8000-000000000001',true);
SELECT set_config('test.pantry_other','aa000000-0000-4000-8000-000000000002',true);
SELECT set_config('test.pantry_session','aa000000-0000-4000-8000-000000000003',true);
SELECT set_config('test.pantry_version','aa000000-0000-4000-8000-000000000004',true);
SELECT set_config('test.pantry_recipe','aa000000-0000-4000-8000-000000000005',true);
SELECT set_config('test.used',jsonb_build_array(jsonb_build_object(
 'itemId',current_setting('test.pantry_item'),'amount',250))::text,true);
SELECT set_config('test.pantry_recipe_doc',jsonb_build_object(
 'title','Test soup','description','','servings',2,'totalMinutes',15,'image','none','sourceNote','','notes','',
 'ingredients',jsonb_build_array(jsonb_build_object(
  'id','aa000000-0000-4000-8000-000000000006','name','Tomatoes','amount',400,'unit','g')),
 'steps',jsonb_build_array(jsonb_build_object(
  'id','aa000000-0000-4000-8000-000000000007','title','Heat','text','Synthetic instruction','timerSeconds',null)))::text,true);
SELECT set_config('test.pantry_state','{"status":"running","activeStep":0,"servings":3,"checkedIngredientIds":[],"timers":[]}',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
SELECT public.kitchen_save_pantry_item(current_setting('test.pantry_item')::uuid,0,
 'ae000000-0000-4000-8000-000000000001','{"name":"Tomatoes","amount":400,"unit":"g","confirmed":true}');
SELECT pg_temp.pantry_assert((
 SELECT revision=1 AND items->0->>'amount'='400' AND items->0->>'confirmedAt' IS NOT NULL
 FROM public.kitchen_pantry),'fresh confirmation with server timestamp');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_save_pantry_item(current_setting('test.pantry_item')::uuid,0,
 'ae000000-0000-4000-8000-000000000002','{"name":"Tomatoes","amount":600,"unit":"g","confirmed":true}')$q$,'PT409');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_save_pantry_item(current_setting('test.pantry_other')::uuid,1,
 'ae000000-0000-4000-8000-000000000002','{"name":"Salt","amount":null,"unit":"g","confirmed":true}')$q$,'22023');
SELECT public.kitchen_save_pantry_item(current_setting('test.pantry_other')::uuid,1,
 'ae000000-0000-4000-8000-000000000002','{"name":"Salt","amount":20,"unit":"g","confirmed":false}');
SELECT pg_temp.pantry_assert((
 SELECT revision=2 AND items->1->>'confirmedAt' IS NULL FROM public.kitchen_pantry
 ),'uncertain amount remains unconfirmed');
SELECT pg_temp.pantry_reject('UPDATE public.kitchen_pantry SET items=''[]''','42501');
SELECT pg_temp.pantry_reject('DELETE FROM public.kitchen_pantry_consumption','42501');

SELECT public.kitchen_save_recipe(current_setting('test.pantry_recipe')::uuid,
 current_setting('test.pantry_version')::uuid,0,current_setting('test.pantry_recipe_doc')::jsonb);
SELECT public.kitchen_save_session(current_setting('test.pantry_session')::uuid,
 current_setting('test.pantry_version')::uuid,0,'ae000000-0000-4000-8000-000000000003',
 current_setting('test.pantry_state')::jsonb);
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,1,2,'ae000000-0000-4000-8000-000000000005',
 current_setting('test.used')::jsonb)$q$,'PT409');
SELECT public.kitchen_save_session(current_setting('test.pantry_session')::uuid,
 current_setting('test.pantry_version')::uuid,1,'ae000000-0000-4000-8000-000000000004',
 jsonb_set(current_setting('test.pantry_state')::jsonb,'{status}','"completed"'));
SELECT pg_temp.pantry_assert((SELECT items->0->>'amount'='400' FROM public.kitchen_pantry)
 AND NOT EXISTS(SELECT 1 FROM public.kitchen_pantry_consumption),'completion never consumes stock');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,2,2,'ae000000-0000-4000-8000-000000000005',
 current_setting('test.used')::jsonb||jsonb_build_array(jsonb_build_object(
 'itemId',current_setting('test.pantry_other'),'amount',1)))$q$,'PT409');
SELECT pg_temp.pantry_assert((SELECT items->0->>'amount'='400' AND revision=2 FROM public.kitchen_pantry),
 'partial confirmation failure is atomic');

RESET ROLE;
UPDATE public.kitchen_pantry SET items=jsonb_set(items,'{0,confirmedAt}',to_jsonb(clock_timestamp()-interval '169 hours'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,2,2,'ae000000-0000-4000-8000-000000000005',
 current_setting('test.used')::jsonb)$q$,'PT409');
SELECT public.kitchen_save_pantry_item(current_setting('test.pantry_item')::uuid,2,
 'ae000000-0000-4000-8000-000000000006','{"name":"Tomatoes","amount":400,"unit":"g","confirmed":true}');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,2,2,'ae000000-0000-4000-8000-000000000005',
 current_setting('test.used')::jsonb)$q$,'PT409');
SELECT public.kitchen_confirm_pantry_consumption(current_setting('test.pantry_session')::uuid,2,3,
 'ae000000-0000-4000-8000-000000000005',current_setting('test.used')::jsonb);
SELECT public.kitchen_confirm_pantry_consumption(current_setting('test.pantry_session')::uuid,2,3,
 'ae000000-0000-4000-8000-000000000005',current_setting('test.used')::jsonb);
SELECT pg_temp.pantry_assert((SELECT (items->1->>'amount')::numeric=150 AND revision=4 FROM public.kitchen_pantry)
 AND (SELECT count(*)=1 FROM public.kitchen_pantry_consumption),'exact retry never consumes twice');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,2,4,'ae000000-0000-4000-8000-000000000007',
 current_setting('test.used')::jsonb)$q$,'PT409');
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.pantry_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_pantry)
 AND NOT EXISTS(SELECT 1 FROM public.kitchen_pantry_consumption),'peer isolation');
SELECT pg_temp.pantry_reject($q$SELECT public.kitchen_confirm_pantry_consumption(
 current_setting('test.pantry_session')::uuid,2,3,'ae000000-0000-4000-8000-000000000005',
 current_setting('test.used')::jsonb)$q$,'PT409');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.pantry_reject('SELECT * FROM public.kitchen_pantry','42501');
SELECT pg_temp.pantry_reject('SELECT * FROM public.kitchen_pantry_consumption','42501');
SELECT pg_temp.pantry_assert(NOT has_function_privilege('anon',
 'public.kitchen_confirm_pantry_consumption(uuid,integer,integer,uuid,jsonb)','EXECUTE'),'anon cannot deduct');
RESET ROLE;
SELECT public.request_account_erasure('ab000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.pantry_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_pantry)
 AND NOT EXISTS(SELECT 1 FROM public.kitchen_pantry_consumption),'pending erasure denies reads');
RESET ROLE;
DELETE FROM auth.users WHERE id='ab000000-0000-4000-8000-000000000001';
SELECT pg_temp.pantry_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_pantry)
 AND NOT EXISTS(SELECT 1 FROM public.kitchen_pantry_consumption),'erasure cascades both private tables');
ROLLBACK;
SELECT 'kitchen_pantry_acceptance_passed';
