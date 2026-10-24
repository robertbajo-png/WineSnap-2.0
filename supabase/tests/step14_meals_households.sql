DO $$ DECLARE t text; f regprocedure; BEGIN
 FOREACH t IN ARRAY ARRAY['kitchen_households','kitchen_household_members','kitchen_household_invites','kitchen_diners','meal_wine_links'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Meals table authorization changed'; END IF;
 END LOOP;
 IF has_column_privilege('authenticated','public.kitchen_household_invites','token_hash','SELECT') OR has_function_privilege('authenticated','public.meals_user_active(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.run_meals_retention(boolean)','EXECUTE') THEN RAISE EXCEPTION 'Private meals capabilities exposed'; END IF;
 FOREACH f IN ARRAY ARRAY['public.kitchen_family_change(text,uuid,integer,jsonb)'::regprocedure,'public.kitchen_invite_create(uuid,uuid,integer,text)'::regprocedure,'public.kitchen_invite_accept(text,text,boolean)'::regprocedure,'public.kitchen_invite_revoke(uuid)'::regprocedure,'public.kitchen_meal_save(uuid,integer,jsonb)'::regprocedure] LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR NOT has_function_privilege('authenticated',f,'EXECUTE') OR position('''40001''' in pg_get_functiondef(f))>0 THEN RAISE EXCEPTION 'Meals RPC grants/conflicts changed'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.kitchen_diners'::regclass AND confrelid='public.kitchen_households'::regclass AND confdeltype='n') THEN RAISE EXCEPTION 'Household deletion must preserve peer profiles'; END IF;
END $$;
