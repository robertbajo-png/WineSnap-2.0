BEGIN;

-- RLS calls this helper for the caller. Never expose another user's role via RPC.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  ELSE false END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'Caller-only role lookup for existing RLS policies. Other-user and missing-session lookups return false.';

COMMIT;
