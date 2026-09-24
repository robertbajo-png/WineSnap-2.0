-- Run after all migrations in a disposable Supabase environment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ai_conversations' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ai_conversations must exist with RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ai_messages' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ai_messages must exist with RLS enabled';
  END IF;

  IF has_table_privilege('authenticated', 'public.ai_messages', 'INSERT')
    OR has_table_privilege('authenticated', 'public.ai_messages', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.ai_messages', 'DELETE') THEN
    RAISE EXCEPTION 'AI messages must be written by the server only';
  END IF;

  IF has_table_privilege('authenticated', 'public.ai_conversations', 'INSERT')
    OR has_table_privilege('authenticated', 'public.ai_conversations', 'UPDATE') THEN
    RAISE EXCEPTION 'AI conversations must be created and updated by the server only';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.store_ai_exchange(uuid,uuid,text,text,text,jsonb,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'AI exchange storage RPC must be service-role only';
  END IF;
END
$$;

SELECT 'Step 3 Ask WineSnap invariants passed' AS result;
