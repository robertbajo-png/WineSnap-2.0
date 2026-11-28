-- Read-only metadata/counts. Verify the selected dashboard project BEFORE running.
-- Does not prove hosted JWT/Storage behavior or authorize any migration.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

WITH required_tables(name) AS (
  VALUES ('wines'), ('wine_photos'), ('profiles'), ('follows'),
    ('ai_rate_limits'), ('taste_signals'), ('ai_conversations'), ('ai_messages'),
    ('recommendation_events'), ('restaurant_scans'), ('collector_lots'),
    ('account_erasure_jobs'), ('privacy_erasure_receipts')
), required_functions(name) AS (
  VALUES ('has_role'), ('consume_ai_quota'), ('privacy_account_active'),
    ('request_account_erasure'), ('claim_account_erasure'),
    ('privacy_account_storage_objects'), ('reset_privacy_memory'),
    ('privacy_orphan_images'), ('run_privacy_retention')
)
SELECT 'postgres_version' AS check_name, to_jsonb(current_setting('server_version')) AS result
UNION ALL
SELECT 'table_security', jsonb_agg(jsonb_build_object(
  'table', r.name, 'present', c.oid IS NOT NULL,
  'rls', coalesce(c.relrowsecurity, false),
  'anon_select', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('anon', c.oid, 'SELECT') ELSE false END,
  'authenticated_select', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('authenticated', c.oid, 'SELECT') ELSE false END
) ORDER BY r.name)
FROM required_tables r
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.name)
UNION ALL
SELECT 'function_permissions', jsonb_agg(jsonb_build_object(
  'function', r.name, 'present', p.oid IS NOT NULL,
  'arguments', CASE WHEN p.oid IS NOT NULL THEN pg_get_function_identity_arguments(p.oid) END,
  'security_definer', coalesce(p.prosecdef, false),
  'anon_execute', CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon', p.oid, 'EXECUTE') ELSE false END,
  'authenticated_execute', CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') ELSE false END
) ORDER BY r.name, p.oid)
FROM required_functions r
LEFT JOIN pg_proc p ON p.proname = r.name AND p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'migration_ledger_presence', jsonb_build_object(
  'supabase_native', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'drizzle_schema', to_regclass('drizzle.__drizzle_migrations') IS NOT NULL,
  'drizzle_public', to_regclass('public.__drizzle_migrations') IS NOT NULL
)
UNION ALL
SELECT 'wine_labels_bucket', coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'public', public
)), '[]'::jsonb) FROM storage.buckets WHERE id = 'wine-labels'
UNION ALL
SELECT 'counts_only', jsonb_build_object(
  'auth_users', (SELECT count(*) FROM auth.users),
  'wines', (SELECT count(*) FROM public.wines),
  'wine_photos', (SELECT count(*) FROM public.wine_photos),
  'storage_objects', (SELECT count(*) FROM storage.objects)
)
ORDER BY check_name;

ROLLBACK;
