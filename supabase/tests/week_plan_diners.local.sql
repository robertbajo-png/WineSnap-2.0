BEGIN;
CREATE FUNCTION pg_temp.diner_assert(value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Week-plan diner check failed'; END IF; END $$;
CREATE FUNCTION pg_temp.diner_reject(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>state THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected SQLSTATE %',state;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('71000000-0000-4000-8000-000000000001','plan-diner-owner@example.test'),
 ('71000000-0000-4000-8000-000000000002','plan-diner-peer@example.test');
UPDATE public.kitchen_config SET enabled=true,chef_enabled=true,meals_enabled=true;
INSERT INTO public.kitchen_diners(id,user_id,document) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"name":"Testgäst","kind":"child","preferences":[]}'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','{"name":"Annan profil","kind":"adult","preferences":[]}');
SELECT set_config('test.diner_plan',
 '{"weekStart":"2026-11-23","meals":[{"date":"2026-11-23","meal":"dinner","recipeVersionId":"73000000-0000-4000-8000-000000000002","servings":3}],"manualItems":[],"shoppingEdits":[]}',true);
SELECT set_config('test.diner_own','["72000000-0000-4000-8000-000000000001"]',true);
SELECT set_config('test.diner_peer','["72000000-0000-4000-8000-000000000002"]',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT public.kitchen_save_recipe('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',0,
 '{"title":"Test soup","description":"","servings":2,"totalMinutes":15,"image":"none","sourceNote":"","notes":"","ingredients":[{"id":"73000000-0000-4000-8000-000000000003","name":"Tomatoes","amount":400,"unit":"g"}],"steps":[{"id":"73000000-0000-4000-8000-000000000004","title":"Cook","text":"Test","timerSeconds":null}]}');
SELECT public.kitchen_save_week_plan('2026-11-23',0,'74000000-0000-4000-8000-000000000001',
 current_setting('test.diner_plan')::jsonb);
SELECT pg_temp.diner_reject($q$SELECT public.kitchen_save_week_plan('2026-11-23',1,
 '74000000-0000-4000-8000-000000000002',
 jsonb_set(current_setting('test.diner_plan')::jsonb,'{meals,0,dinerIds}',current_setting('test.diner_peer')::jsonb))$q$,'42501');
SELECT pg_temp.diner_reject($q$SELECT public.kitchen_save_week_plan('2026-11-23',1,
 '74000000-0000-4000-8000-000000000002',
 jsonb_set(current_setting('test.diner_plan')::jsonb,'{meals,0,dinerIds}',
 current_setting('test.diner_own')::jsonb||current_setting('test.diner_own')::jsonb))$q$,'22023');
SELECT public.kitchen_save_week_plan('2026-11-23',1,'74000000-0000-4000-8000-000000000002',
 jsonb_set(current_setting('test.diner_plan')::jsonb,'{meals,0,dinerIds}',current_setting('test.diner_own')::jsonb));
SELECT pg_temp.diner_assert((SELECT revision=2 AND document#>'{meals,0,dinerIds}'=current_setting('test.diner_own')::jsonb FROM public.kitchen_week_plans));
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.diner_assert(NOT EXISTS(SELECT 1 FROM public.kitchen_week_plans));

RESET ROLE;
DELETE FROM public.kitchen_diners WHERE id='72000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT public.kitchen_save_week_plan('2026-11-23',2,'74000000-0000-4000-8000-000000000003',
 jsonb_set((SELECT document FROM public.kitchen_week_plans),'{meals,0,servings}','4'));
SELECT pg_temp.diner_reject($q$SELECT public.kitchen_save_week_plan('2026-11-23',3,
 '74000000-0000-4000-8000-000000000004',
 jsonb_set((SELECT document FROM public.kitchen_week_plans),'{meals,0,meal}','"lunch"'))$q$,'42501');
SELECT public.kitchen_save_week_plan('2026-11-23',3,'74000000-0000-4000-8000-000000000004',
 current_setting('test.diner_plan')::jsonb);
SELECT pg_temp.diner_assert((SELECT revision=4 AND document#>'{meals,0,dinerIds}' IS NULL FROM public.kitchen_week_plans));
RESET ROLE;
ROLLBACK;
SELECT 'week_plan_diners_acceptance_passed';
