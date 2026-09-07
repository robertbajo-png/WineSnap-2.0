-- Minimal Supabase platform contracts for a disposable PostgreSQL test cluster.
-- Auth JWT verification and Storage HTTP behavior are not simulated here.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE EXTENSION pgcrypto;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text NOT NULL,
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1];
$$;
-- Simulated operation context for policy unit tests; hosted tests use Storage HTTP.
CREATE FUNCTION storage.allow_any_operation(operations text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.storage_operation', true) = ANY(operations), false);
$$;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
