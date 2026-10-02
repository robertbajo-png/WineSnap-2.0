-- Run after all migrations in a disposable Supabase environment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'recommendation_events' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'recommendation_events must exist with RLS enabled';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.recommendation_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated users must be able to record their own feedback';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.sync_recommendation_feedback_signals()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'recommendation signal trigger must not be callable by clients';
  END IF;
END
$$;

SELECT 'Step 4 recommendation invariants passed' AS result;
