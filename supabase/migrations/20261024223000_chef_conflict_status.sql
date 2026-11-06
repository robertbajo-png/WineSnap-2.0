-- Business conflicts must not masquerade as PostgreSQL serialization failures.
-- Some hosted PostgREST versions retry 40001 internally; PT409 is terminal.
DO $$ DECLARE target regprocedure; definition text; BEGIN
 FOREACH target IN ARRAY ARRAY[
  'public.food_memory_change(text,uuid,integer,jsonb)'::regprocedure,
  'public.chef_claim_request(uuid,uuid,text,text,uuid,integer)'::regprocedure,
  'public.chef_finish_request(uuid,uuid,jsonb,text,uuid,jsonb)'::regprocedure
 ] LOOP
  definition:=pg_get_functiondef(target);
  EXECUTE replace(definition,'''40001''','''PT409''');
 END LOOP;
END $$;
