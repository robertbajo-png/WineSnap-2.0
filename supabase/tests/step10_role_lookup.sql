BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('10101010-1010-4010-8010-101010101001', 'role-owner@example.test'),
  ('10101010-1010-4010-8010-101010101002', 'role-admin@example.test');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('10101010-1010-4010-8010-101010101002', 'admin');

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.has_role(uuid,public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role lookup must remain forbidden';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid,public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated RLS helper is unavailable';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10101010-1010-4010-8010-101010101001', true);

DO $$ BEGIN
  IF public.has_role('10101010-1010-4010-8010-101010101001', 'user') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Own role lookup failed';
  END IF;
  IF public.has_role('10101010-1010-4010-8010-101010101002', 'admin') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Peer role RPC disclosed private information';
  END IF;
  IF public.has_role('10101010-1010-4010-8010-101010101001', 'admin') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Ordinary user acquired administrator privileges';
  END IF;
  IF (SELECT count(*) FROM public.user_roles WHERE user_id = auth.uid()) <> 1 THEN
    RAISE EXCEPTION 'Owner-filtered role export failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Ordinary user read another users roles';
  END IF;
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin');
    RAISE EXCEPTION 'Ordinary user could grant themselves admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10101010-1010-4010-8010-101010101002', true);

DO $$ BEGIN
  IF public.has_role('10101010-1010-4010-8010-101010101002', 'admin') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Existing administrator authorization broke';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '10101010-1010-4010-8010-101010101001') THEN
    RAISE EXCEPTION 'Existing administrator read policy broke';
  END IF;
  IF public.has_role('10101010-1010-4010-8010-101010101001', 'user') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Even administrators RPC must be caller-only';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  IF public.has_role('10101010-1010-4010-8010-101010101002', 'admin') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Missing-session lookup must fail closed';
  END IF;
END $$;

ROLLBACK;
