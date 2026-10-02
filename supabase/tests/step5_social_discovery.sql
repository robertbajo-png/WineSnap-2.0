-- Run after all migrations in a disposable Supabase environment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_taste_similarity'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'user_taste_similarity must exist with RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.user_taste_similarity', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous users must not read taste similarities';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_social_discovery(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated users need social discovery access';
  END IF;

  IF has_function_privilege('anon', 'public.get_social_discovery(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous users must not call social discovery';
  END IF;
END
$$;

SELECT 'Step 5 social discovery invariants passed' AS result;
