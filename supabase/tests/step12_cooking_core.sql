-- Read-only invariants. The cooking gate must stay operator-controlled.
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['kitchen_recipes','kitchen_recipe_versions','cooking_sessions','cooking_feedback'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||tab)::regclass) THEN RAISE EXCEPTION 'Cooking requires RLS'; END IF;
  IF has_table_privilege('anon','public.'||tab,'SELECT,INSERT,UPDATE,DELETE') OR
     has_table_privilege('authenticated','public.'||tab,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Direct cooking writes are forbidden'; END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public.kitchen_config','SELECT,UPDATE') OR
    has_function_privilege('anon','public.kitchen_save_recipe(uuid,uuid,integer,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Cooking grants are too broad'; END IF;
END $$;
