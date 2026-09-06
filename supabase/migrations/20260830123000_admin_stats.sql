BEGIN;

-- The previous admin policies call a function whose EXECUTE permission was
-- revoked from authenticated clients. Keep client role access read-only and
-- self-scoped; role administration remains a trusted service operation.
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'wines', (SELECT count(*) FROM public.wines),
    'public_wines', (SELECT count(*) FROM public.wines WHERE is_public = true),
    'wishlist_items', (SELECT count(*) FROM public.wishlist)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

COMMIT;
