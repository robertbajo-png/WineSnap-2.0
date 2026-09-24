-- Run after migrations in a disposable Supabase project or local database.
-- The script fails immediately when a Step 1 security invariant is missing.

DO $$
BEGIN
  IF coalesce(
    (SELECT public FROM storage.buckets WHERE id = 'wine-labels'),
    true
  ) THEN
    RAISE EXCEPTION 'wine-labels must be a private bucket';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Wine labels owner or shared read'
  ) THEN
    RAISE EXCEPTION 'private/shared wine-label read policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ai_rate_limits'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ai_rate_limits must exist with RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.ai_rate_limits', 'SELECT')
    OR has_table_privilege('authenticated', 'public.ai_rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'AI quota rows must not be readable by clients';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.consume_ai_quota(uuid,text,integer,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.consume_ai_quota(uuid,text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'AI quota RPC must be service-role only';
  END IF;
END
$$;

SELECT 'Step 1 database security invariants passed' AS result;
