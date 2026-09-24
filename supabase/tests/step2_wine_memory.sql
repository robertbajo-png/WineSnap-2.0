-- Run after all migrations in a disposable Supabase environment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'taste_signals' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'taste_signals must exist with RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'derived_preferences' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'derived_preferences must exist with RLS enabled';
  END IF;

  IF has_table_privilege('authenticated', 'public.taste_signals', 'INSERT')
    OR has_table_privilege('authenticated', 'public.derived_preferences', 'INSERT') THEN
    RAISE EXCEPTION 'clients must not write Wine Memory tables directly';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.replace_extracted_preference_signals(uuid,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'preference extraction RPC must be service-role only';
  END IF;
END
$$;

SELECT 'Step 2 Wine Memory invariants passed' AS result;
