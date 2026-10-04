-- Read-only invariants, safe to run after the collector migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.collector_lots'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Collector lots require RLS';
  END IF;
  IF has_table_privilege('anon', 'public.collector_lots', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Anonymous collector access is forbidden';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.collector_lots', 'INSERT') THEN
    RAISE EXCEPTION 'Owners must be able to create acquisitions';
  END IF;
  IF has_function_privilege('authenticated', 'public.guard_collector_stock()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Stock guard must only be invoked by triggers';
  END IF;
END $$;
SELECT 'Collector invariants passed' AS result;
