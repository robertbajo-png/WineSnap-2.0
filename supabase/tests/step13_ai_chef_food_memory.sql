-- Read-only security invariants, safe regardless of the operator's current gate value.
DO $$ DECLARE tab text; target regprocedure; BEGIN
 FOREACH tab IN ARRAY ARRAY['food_memory_state','food_signals','food_memory_tombstones','chef_conversations','chef_messages','chef_requests'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||tab)::regclass) THEN RAISE EXCEPTION 'Chef requires RLS'; END IF;
  IF has_table_privilege('anon','public.'||tab,'SELECT,INSERT,UPDATE,DELETE') OR
     has_table_privilege('authenticated','public.'||tab,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Direct Chef writes are forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=('public.'||tab)::regclass AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c') THEN RAISE EXCEPTION 'Chef requires cascading account ownership'; END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public.food_memory_tombstones','SELECT') OR
    has_function_privilege('anon','public.chef_access()','EXECUTE') OR
    has_function_privilege('authenticated','public.chef_user_active(uuid)','EXECUTE') OR
    NOT has_function_privilege('authenticated','public.food_memory_change(text,uuid,integer,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Chef grants are too broad'; END IF;
 FOREACH target IN ARRAY ARRAY[
  'public.chef_claim_request(uuid,uuid,text,text,uuid,integer)'::regprocedure,
  'public.chef_finish_request(uuid,uuid,jsonb,text,uuid,jsonb)'::regprocedure,
  'public.chef_fail_request(uuid,uuid)'::regprocedure,
  'public.reset_food_memory(uuid)'::regprocedure,
  'public.run_chef_retention(boolean)'::regprocedure
 ] LOOP
  IF has_function_privilege('authenticated',target,'EXECUTE') OR has_function_privilege('anon',target,'EXECUTE') OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN RAISE EXCEPTION 'Chef server-only function grants changed'; END IF;
 END LOOP;
 IF position('''40001''' in pg_get_functiondef('public.chef_claim_request(uuid,uuid,text,text,uuid,integer)'::regprocedure))>0 THEN RAISE EXCEPTION 'Business conflicts must use terminal PT409'; END IF;
END $$;
