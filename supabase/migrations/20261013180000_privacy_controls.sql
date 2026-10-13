BEGIN;

CREATE TABLE public.account_erasure_jobs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error_code text CHECK (last_error_code IN ('storage_error', 'auth_error', 'worker_error'))
);
ALTER TABLE public.account_erasure_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_erasure_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_erasure_jobs TO service_role;

-- Preserve a protected external copy before restoring a database backup.
CREATE TABLE public.privacy_erasure_receipts (
  user_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.privacy_erasure_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_erasure_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.privacy_erasure_receipts TO service_role;

CREATE FUNCTION public.privacy_account_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user_id)
    AND NOT EXISTS (SELECT 1 FROM public.privacy_erasure_receipts j WHERE j.user_id = _user_id);
$$;
REVOKE ALL ON FUNCTION public.privacy_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_account_active(uuid) TO authenticated, service_role;

-- Auth cascades delete wines after the parent disappears. The old trigger
-- attempted to reinsert a taste profile for that missing parent.
CREATE OR REPLACE FUNCTION public.trg_wines_recompute_taste()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.privacy_account_active(OLD.user_id) THEN
      PERFORM public.recompute_taste_profile(OLD.user_id);
    END IF;
    RETURN OLD;
  END IF;
  IF public.privacy_account_active(NEW.user_id) THEN
    PERFORM public.recompute_taste_profile(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_wines_recompute_taste() FROM PUBLIC, anon, authenticated;

-- A still-unexpired JWT must not recreate data after erasure starts or completes.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'user_roles', 'wines', 'taste_profile', 'wishlist',
      'wine_photos', 'tasting_notes', 'follows', 'restaurant_scans', 'analytics_events',
      'taste_signals', 'derived_preferences', 'ai_conversations', 'ai_messages',
      'recommendation_events', 'user_taste_similarity', 'collector_lots')
  LOOP
    EXECUTE format('CREATE POLICY privacy_active_session ON public.%I AS RESTRICTIVE
      FOR ALL TO authenticated USING (public.privacy_account_active(auth.uid()))
      WITH CHECK (public.privacy_account_active(auth.uid()))', item.tablename);
  END LOOP;
END;
$$;
CREATE POLICY privacy_active_session ON storage.objects AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.privacy_account_active(auth.uid()))
  WITH CHECK (public.privacy_account_active(auth.uid()));

-- Optional statistics are disabled, including requests from older clients.
REVOKE INSERT ON public.analytics_events FROM authenticated;

CREATE FUNCTION public.request_account_erasure(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Account unavailable';
  END IF;
  INSERT INTO public.account_erasure_jobs(user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.privacy_erasure_receipts(user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  UPDATE public.wines SET is_public = false WHERE user_id = _user_id;
  UPDATE public.profiles SET is_public = false WHERE id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_account_erasure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_erasure(uuid) TO service_role;

CREATE FUNCTION public.claim_account_erasure(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.account_erasure_jobs SET attempts = attempts + 1,
    last_attempt_at = now(), last_error_code = NULL
  WHERE user_id = _user_id AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '5 minutes');
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_account_erasure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_erasure(uuid) TO service_role;

-- Only metadata is read here. Actual files must be removed through Storage API.
CREATE FUNCTION public.privacy_account_storage_objects(_user_id uuid, _limit integer DEFAULT 200)
RETURNS TABLE(bucket_id text, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.owner_id = _user_id::text OR o.owner::text = _user_id::text
    OR (o.bucket_id = 'wine-labels' AND split_part(o.name, '/', 1) = _user_id::text)
  ORDER BY o.bucket_id, o.name LIMIT least(greatest(_limit, 1), 501);
$$;
REVOKE ALL ON FUNCTION public.privacy_account_storage_objects(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_account_storage_objects(uuid, integer) TO service_role;

CREATE FUNCTION public.reset_privacy_memory(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.privacy_account_active(_user_id) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  DELETE FROM public.taste_signals WHERE user_id = _user_id;
  DELETE FROM public.derived_preferences WHERE user_id = _user_id;
  DELETE FROM public.taste_profile WHERE user_id = _user_id;
  DELETE FROM public.recommendation_events WHERE user_id = _user_id;
  DELETE FROM public.user_taste_similarity WHERE user_id = _user_id OR peer_user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_privacy_memory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_privacy_memory(uuid) TO service_role;

CREATE FUNCTION public.privacy_orphan_images(_limit integer DEFAULT 100)
RETURNS TABLE(bucket_id text, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.bucket_id = 'wine-labels' AND o.created_at < now() - interval '23 hours'
    AND NOT EXISTS (SELECT 1 FROM public.wine_photos p WHERE p.storage_path = o.name
      OR p.url = o.name OR split_part(split_part(p.url, '/wine-labels/', 2), '?', 1) = o.name)
    AND NOT EXISTS (SELECT 1 FROM public.wines w WHERE w.image_url = o.name
      OR split_part(split_part(w.image_url, '/wine-labels/', 2), '?', 1) = o.name)
  ORDER BY o.created_at, o.name LIMIT least(greatest(_limit, 1), 100);
$$;
REVOKE ALL ON FUNCTION public.privacy_orphan_images(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_orphan_images(integer) TO service_role;

-- Fixed windows, bounded batches and preview by default. Migration does not purge data.
CREATE FUNCTION public.run_privacy_retention(_execute boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE messages bigint; conversations bigint; analytics bigint; quotas bigint; inactivity bigint; titles bigint;
BEGIN
  SELECT count(*) INTO messages FROM public.ai_messages WHERE created_at < now() - interval '90 days';
  SELECT count(*) INTO conversations FROM public.ai_conversations WHERE last_message_at < now() - interval '90 days';
  SELECT count(*) INTO analytics FROM public.analytics_events;
  SELECT count(*) INTO quotas FROM public.ai_rate_limits WHERE updated_at < now() - interval '30 days';
  SELECT count(*) INTO titles FROM public.ai_conversations WHERE created_at < now() - interval '90 days'
    AND (title <> 'WineSnap' OR summary IS NOT NULL);
  SELECT count(*) INTO inactivity FROM auth.users WHERE coalesce(last_sign_in_at, created_at) < now() - interval '24 months';
  IF _execute THEN
    UPDATE public.privacy_erasure_receipts r SET completed_at = now()
      WHERE completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id = r.user_id);
    DELETE FROM public.privacy_erasure_receipts r WHERE completed_at < now() - interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM public.account_erasure_jobs j WHERE j.user_id = r.user_id);
    DELETE FROM public.ai_messages WHERE id IN (SELECT id FROM public.ai_messages
      WHERE created_at < now() - interval '90 days' ORDER BY created_at, id LIMIT 1000);
    -- A long-running thread must not retain its original private question as title.
    UPDATE public.ai_conversations SET title = 'WineSnap', summary = NULL WHERE id IN
      (SELECT id FROM public.ai_conversations WHERE created_at < now() - interval '90 days'
        AND (title <> 'WineSnap' OR summary IS NOT NULL) ORDER BY created_at, id LIMIT 1000);
    DELETE FROM public.ai_conversations WHERE id IN (SELECT id FROM public.ai_conversations
      WHERE last_message_at < now() - interval '90 days' ORDER BY last_message_at, id LIMIT 1000);
    DELETE FROM public.analytics_events WHERE id IN (SELECT id FROM public.analytics_events ORDER BY created_at, id LIMIT 1000);
    DELETE FROM public.ai_rate_limits WHERE (user_id, function_name, window_started_at) IN
      (SELECT user_id, function_name, window_started_at FROM public.ai_rate_limits
        WHERE updated_at < now() - interval '30 days' ORDER BY updated_at LIMIT 1000);
  END IF;
  RETURN jsonb_build_object('execute', _execute, 'eligible_messages', messages,
    'eligible_conversations', conversations, 'eligible_analytics', analytics,
    'eligible_old_titles', titles,
    'eligible_quotas', quotas, 'inactive_accounts_for_manual_review', inactivity,
    'more_batches_required', greatest(messages, conversations, analytics, quotas, titles) > 1000);
END;
$$;
REVOKE ALL ON FUNCTION public.run_privacy_retention(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_privacy_retention(boolean) TO service_role;

COMMIT;
