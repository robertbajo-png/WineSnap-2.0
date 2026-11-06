-- Temporary, connection-local helpers; no application rows or schema are changed.
SET timezone = 'UTC';
CREATE FUNCTION pg_temp.owned_table_digest(schema_name text, table_name text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE format($query$
    SELECT jsonb_build_object('rows',count(*),'sha256',
      encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex'))
    FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h
      FROM %I.%I r) hashes
  $query$, schema_name, table_name) INTO result;
  RETURN jsonb_build_object('schema',schema_name,'table',table_name) || result;
END $$;
CREATE FUNCTION pg_temp.owned_json_digest(value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(value,'[]'::jsonb)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION pg_temp.owned_acl(value aclitem[], owner_id oid, kind "char")
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantor',pg_get_userbyid(grantor),
    'grantee',CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,
    'privilege',privilege_type,'grantable',is_grantable)
    ORDER BY pg_get_userbyid(grantor),
      CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,
      privilege_type,is_grantable),'[]'::jsonb)
  FROM aclexplode(coalesce(value,acldefault(kind,owner_id)));
$$;
WITH scope AS (
  SELECT oid,nspname FROM pg_namespace
  WHERE nspname IN ('public','auth','storage','extensions','winesnap_local')
), tables AS (
  SELECT n.nspname,c.relname,c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN scope n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p')
)
SELECT jsonb_build_object(
  'algorithm','owned-logical-v1',
  'relations',(SELECT jsonb_agg(pg_temp.owned_table_digest(nspname,relname)
    ORDER BY nspname,relname) FROM tables),
  'catalog',jsonb_build_object(
    'tables',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'schema',nspname,'name',relname,'owner',pg_get_userbyid(relowner),
      'rls',relrowsecurity,'forced',relforcerowsecurity) ORDER BY nspname,relname) FROM tables)),
    -- pg_dump compacts dropped attnums. Preserve logical order, not opaque IDs.
    'columns',pg_temp.owned_json_digest((SELECT jsonb_agg(
      (to_jsonb(c)-'dtd_identifier'-'ordinal_position') ORDER BY table_schema,table_name,logical_position)
      FROM (SELECT c.*,row_number() OVER (PARTITION BY table_schema,table_name ORDER BY ordinal_position) logical_position
        FROM information_schema.columns c WHERE table_schema IN (SELECT nspname FROM scope)) c)),
    'policies',pg_temp.owned_json_digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname)
      FROM pg_policies p WHERE schemaname IN (SELECT nspname FROM scope))),
    'grants',pg_temp.owned_json_digest((SELECT jsonb_agg(to_jsonb(g) ORDER BY table_schema,table_name,grantee,privilege_type,grantor)
      FROM information_schema.role_table_grants g WHERE table_schema IN (SELECT nspname FROM scope))),
    'views',pg_temp.owned_json_digest((SELECT jsonb_agg(to_jsonb(v) ORDER BY schemaname,viewname)
      FROM pg_views v WHERE schemaname IN (SELECT nspname FROM scope))),
    'sequences',pg_temp.owned_json_digest((SELECT jsonb_agg(to_jsonb(s) ORDER BY schemaname,sequencename)
      FROM pg_sequences s WHERE schemaname IN (SELECT nspname FROM scope))),
    'functions',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
      'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),
      'acl',pg_temp.owned_acl(p.proacl,p.proowner,'f')) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN scope n ON p.pronamespace=n.oid WHERE p.prokind IN ('f','p'))),
    'schemas',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'name',n.nspname,'owner',pg_get_userbyid(n.nspowner)) ORDER BY n.nspname)
      FROM pg_namespace n WHERE n.oid IN (SELECT oid FROM scope))),
    'schema_grants',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'name',n.nspname,'acl',pg_temp.owned_acl(n.nspacl,n.nspowner,'n')) ORDER BY n.nspname)
      FROM pg_namespace n WHERE n.oid IN (SELECT oid FROM scope))),
    'roles',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'name',rolname,'super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
      'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,
      'bypass_rls',rolbypassrls,'limit',rolconnlimit,'until',rolvaliduntil,'config',rolconfig)
      ORDER BY rolname) FROM pg_roles WHERE rolname IN
      ('postgres','anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin'))),
    'memberships',pg_temp.owned_json_digest((SELECT jsonb_agg(jsonb_build_object(
      'role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),
      'admin',admin_option,'inherit',inherit_option,'set',set_option)
      ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor))
      FROM pg_auth_members WHERE pg_get_userbyid(member) IN
      ('postgres','anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin')))
  )
)::text;
