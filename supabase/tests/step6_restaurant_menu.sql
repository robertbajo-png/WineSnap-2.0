-- Read-only invariants; safe to run after the restaurant migration.
DO $$
DECLARE
  field_name text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY['constraints', 'extracted_wines', 'language']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'restaurant_scans'
        AND column_name = field_name
    ) THEN
      RAISE EXCEPTION 'Missing restaurant_scans.%', field_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'restaurant_scans' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Restaurant scan RLS must be enabled';
  END IF;

  IF has_table_privilege('anon', 'public.restaurant_scans', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous users must not read menu history';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recommendation_events'::regclass
      AND conname = 'recommendation_events_source_check'
      AND pg_get_constraintdef(oid) LIKE '%restaurant%'
  ) THEN
    RAISE EXCEPTION 'Restaurant feedback source must be supported';
  END IF;
END
$$;

SELECT 'Step 6 restaurant menu invariants passed' AS result;
