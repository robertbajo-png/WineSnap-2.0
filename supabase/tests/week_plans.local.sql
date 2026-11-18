BEGIN;
CREATE FUNCTION pg_temp.require(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'Week plan assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'Expected week plan rejection: %',expected;
END $$;
CREATE FUNCTION pg_temp.plan(version_id uuid DEFAULT 'b6000000-0000-4000-8000-000000000011')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('weekStart','2026-11-16',
  'meals',jsonb_build_array(jsonb_build_object(
   'date','2026-11-16','meal','dinner','recipeVersionId',version_id,'servings',4)),
  'manualItems','[{"id":"b6000000-0000-4000-8000-000000000021","item":{"name":"Citron","amount":null,"unit":null},"checked":true}]'::jsonb,
  'shoppingEdits',jsonb_build_array(jsonb_build_object(
   'key','g:tomat','basis',jsonb_build_object('knownAmount',400,'unknownAmounts',0,
    'sources',jsonb_build_array(jsonb_build_object(
     'date','2026-11-16','meal','dinner','recipeVersionId',version_id,'servings',4))),
   'checked',true,'excluded',false,'adjustment',null))
 );
$$;
INSERT INTO auth.users(id,email) VALUES
 ('b6000000-0000-4000-8000-000000000001','week-owner@example.test'),
 ('b6000000-0000-4000-8000-000000000002','week-peer@example.test');
INSERT INTO public.kitchen_recipes(id,user_id) VALUES
 ('b6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001'),
 ('b6000000-0000-4000-8000-000000000004','b6000000-0000-4000-8000-000000000002');
INSERT INTO public.kitchen_recipe_versions(id,recipe_id,user_id,revision,document)
 SELECT fixture.id,fixture.recipe,fixture.owner,fixture.revision,
  '{"title":"Synthetic recipe","description":"","servings":2,"totalMinutes":20,"image":"none","sourceNote":"","notes":"","ingredients":[{"id":"b6000000-0000-4000-8000-000000000008","name":"Tomat","amount":200,"unit":"g"}],"steps":[{"id":"b6000000-0000-4000-8000-000000000009","title":"Cook","text":"Test only","timerSeconds":null}]}'::jsonb
 FROM (VALUES
  ('b6000000-0000-4000-8000-000000000011'::uuid,'b6000000-0000-4000-8000-000000000003'::uuid,'b6000000-0000-4000-8000-000000000001'::uuid,1),
  ('b6000000-0000-4000-8000-000000000012'::uuid,'b6000000-0000-4000-8000-000000000004'::uuid,'b6000000-0000-4000-8000-000000000002'::uuid,1),
  ('b6000000-0000-4000-8000-000000000013'::uuid,'b6000000-0000-4000-8000-000000000003'::uuid,'b6000000-0000-4000-8000-000000000001'::uuid,2)
 ) AS fixture(id,recipe,owner,revision);
UPDATE public.kitchen_recipes SET current_version_id='b6000000-0000-4000-8000-000000000013',revision=2
 WHERE id='b6000000-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan())$q$,'42501');
RESET ROLE;
UPDATE public.kitchen_config SET enabled=true;

SET LOCAL ROLE authenticated;
SELECT pg_temp.reject('INSERT INTO public.kitchen_week_plans DEFAULT VALUES','42501');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-17',0,gen_random_uuid(),pg_temp.plan())$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),'null')$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),jsonb_set(pg_temp.plan(),'{meals}',(pg_temp.plan()->'meals') || (pg_temp.plan()->'meals')))$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),jsonb_set(pg_temp.plan(),'{meals,0,date}','"2026-11-23"'))$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),jsonb_set(pg_temp.plan(),'{manualItems,0,item,amount}','2'))$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan('b6000000-0000-4000-8000-000000000012'))$q$,'42501');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan('b6000000-0000-4000-8000-000000000018'))$q$,'42501');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan() || '{"user_id":"b6000000-0000-4000-8000-000000000002"}')$q$,'22023');
SELECT pg_temp.require(
 (public.kitchen_save_week_plan('2026-11-16',0,'b6000000-0000-4000-8000-000000000031',pg_temp.plan())->>'revision')::int=1,
 'create with exact old recipe version and shopping data'
);
SELECT pg_temp.require(
 (public.kitchen_save_week_plan('2026-11-16',0,'b6000000-0000-4000-8000-000000000031',pg_temp.plan())->>'revision')::int=1,
 'lost create reply does not advance revision'
);
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,'b6000000-0000-4000-8000-000000000031',jsonb_set(pg_temp.plan(),'{meals,0,servings}','5'))$q$,'22023');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan())$q$,'PT409');
SELECT pg_temp.require((SELECT document=pg_temp.plan() FROM public.kitchen_week_plans),'owned read retains exact document');
SELECT pg_temp.require(
 (public.kitchen_save_week_plan('2026-11-16',1,'b6000000-0000-4000-8000-000000000032',jsonb_set(pg_temp.plan(),'{meals,0,servings}','5'))->>'revision')::int=2,
 'revision checked update'
);
SELECT pg_temp.require(
 (public.kitchen_save_week_plan('2026-11-16',1,'b6000000-0000-4000-8000-000000000032',jsonb_set(pg_temp.plan(),'{meals,0,servings}','5'))->>'revision')::int=2,
 'lost update reply does not advance revision'
);
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',1,gen_random_uuid(),pg_temp.plan())$q$,'PT409');
SELECT pg_temp.reject('UPDATE public.kitchen_week_plans SET revision=3','42501');
SELECT pg_temp.reject('DELETE FROM public.kitchen_week_plans','42501');

SELECT set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.require((SELECT count(*)=0 FROM public.kitchen_week_plans),'peer cannot read owner documents');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan())$q$,'42501');
SELECT pg_temp.require(
 (public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan('b6000000-0000-4000-8000-000000000012'))->>'user_id')=
 'b6000000-0000-4000-8000-000000000002','same date belongs to independent owner'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.reject('SELECT * FROM public.kitchen_week_plans','42501');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',0,gen_random_uuid(),pg_temp.plan())$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.require((SELECT count(*)=2 FROM public.kitchen_week_plans),'export role can read');
SELECT pg_temp.reject('DELETE FROM public.kitchen_week_plans','42501');
RESET ROLE;

SELECT public.request_account_erasure('b6000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.require((SELECT count(*)=0 FROM public.kitchen_week_plans),'erasure immediately hides plans');
SELECT pg_temp.reject($q$SELECT public.kitchen_save_week_plan('2026-11-16',2,gen_random_uuid(),pg_temp.plan())$q$,'42501');
RESET ROLE;
DELETE FROM auth.users WHERE id='b6000000-0000-4000-8000-000000000001';
SELECT pg_temp.require(
 (SELECT count(*)=1 AND bool_and(user_id='b6000000-0000-4000-8000-000000000002') FROM public.kitchen_week_plans),
 'erasure cascades only the requested owner'
);
ROLLBACK;
SELECT 'week_plans_acceptance_passed';
