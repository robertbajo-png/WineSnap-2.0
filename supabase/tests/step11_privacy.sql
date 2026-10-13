BEGIN;
INSERT INTO auth.users(id,email) VALUES
  ('11111111-1111-4111-8111-111111111101','privacy-a@example.test'),
  ('11111111-1111-4111-8111-111111111102','privacy-b@example.test');
INSERT INTO public.wines(id,user_id,wine_name,image_url,is_public) VALUES
  ('11111111-1111-4111-8111-111111111201','11111111-1111-4111-8111-111111111101','A','11111111-1111-4111-8111-111111111101/attached.jpg',true),
  ('11111111-1111-4111-8111-111111111202','11111111-1111-4111-8111-111111111102','B',null,false);
INSERT INTO storage.objects(bucket_id,name,owner_id,created_at) VALUES
  ('wine-labels','11111111-1111-4111-8111-111111111101/attached.jpg','11111111-1111-4111-8111-111111111101',now()-interval '2 days'),
  ('wine-labels','11111111-1111-4111-8111-111111111101/orphan.jpg','11111111-1111-4111-8111-111111111101',now()-interval '2 days'),
  ('wine-labels','11111111-1111-4111-8111-111111111101/new.jpg','11111111-1111-4111-8111-111111111101',now());
INSERT INTO public.ai_conversations(id,user_id,title,last_message_at) VALUES
  ('11111111-1111-4111-8111-111111111301','11111111-1111-4111-8111-111111111101','old',now()-interval '91 days'),
  ('11111111-1111-4111-8111-111111111302','11111111-1111-4111-8111-111111111102','new',now());
INSERT INTO public.ai_conversations(id,user_id,title,summary,created_at,last_message_at) VALUES
  ('11111111-1111-4111-8111-111111111303','11111111-1111-4111-8111-111111111102',
    'historic private question','historic summary',now()-interval '91 days',now());
INSERT INTO public.ai_messages(conversation_id,user_id,role,content,created_at) VALUES
  ('11111111-1111-4111-8111-111111111301','11111111-1111-4111-8111-111111111101','user','old',now()-interval '91 days'),
  ('11111111-1111-4111-8111-111111111302','11111111-1111-4111-8111-111111111102','user','new',now());

DO $$ BEGIN
  IF has_function_privilege('authenticated','public.request_account_erasure(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.run_privacy_retention(boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.privacy_account_storage_objects(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Privileged privacy operation exposed';
  END IF;
  PERFORM public.run_privacy_retention(false);
  IF NOT EXISTS(SELECT 1 FROM public.ai_messages WHERE content='old') THEN RAISE EXCEPTION 'Dry run deleted data'; END IF;
  IF EXISTS(SELECT 1 FROM public.privacy_orphan_images(100) WHERE name LIKE '%/attached.jpg' OR name LIKE '%/new.jpg') THEN
    RAISE EXCEPTION 'Attached or new image selected for cleanup';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.privacy_orphan_images(100) WHERE name LIKE '%/orphan.jpg') THEN RAISE EXCEPTION 'Orphan missed'; END IF;
  IF EXISTS(SELECT 1 FROM public.privacy_account_storage_objects('11111111-1111-4111-8111-111111111102',200)
    WHERE name LIKE '11111111-1111-4111-8111-111111111101/%') THEN RAISE EXCEPTION 'Peer files disclosed'; END IF;
  PERFORM public.run_privacy_retention(true);
  IF EXISTS(SELECT 1 FROM public.ai_messages WHERE content='old') THEN RAISE EXCEPTION 'Old message retained'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_messages WHERE content='new') THEN RAISE EXCEPTION 'Recent message deleted'; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_conversations WHERE id='11111111-1111-4111-8111-111111111303'
    AND (title <> 'WineSnap' OR summary IS NOT NULL)) THEN RAISE EXCEPTION 'Historic question remained in active title'; END IF;
  PERFORM public.reset_privacy_memory('11111111-1111-4111-8111-111111111101');
  IF EXISTS(SELECT 1 FROM public.taste_profile WHERE user_id='11111111-1111-4111-8111-111111111101') THEN RAISE EXCEPTION 'Memory retained'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.taste_profile WHERE user_id='11111111-1111-4111-8111-111111111102') THEN RAISE EXCEPTION 'Peer memory deleted'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.wines WHERE id='11111111-1111-4111-8111-111111111201') THEN RAISE EXCEPTION 'Memory reset deleted wine'; END IF;
  PERFORM public.request_account_erasure('11111111-1111-4111-8111-111111111101');
  PERFORM public.request_account_erasure('11111111-1111-4111-8111-111111111101');
  IF (SELECT count(*) FROM public.account_erasure_jobs WHERE user_id='11111111-1111-4111-8111-111111111101') <> 1 THEN RAISE EXCEPTION 'Request not idempotent'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.privacy_erasure_receipts WHERE user_id='11111111-1111-4111-8111-111111111101') THEN RAISE EXCEPTION 'Erasure ledger missing'; END IF;
  IF NOT public.claim_account_erasure('11111111-1111-4111-8111-111111111101')
    OR public.claim_account_erasure('11111111-1111-4111-8111-111111111101') THEN RAISE EXCEPTION 'Concurrent claim not guarded'; END IF;
  IF EXISTS(SELECT 1 FROM public.wines WHERE user_id='11111111-1111-4111-8111-111111111101' AND is_public) THEN RAISE EXCEPTION 'Share stayed public'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.wines) THEN RAISE EXCEPTION 'Frozen JWT could read application data'; END IF;
  BEGIN
    INSERT INTO public.wines(user_id,wine_name) VALUES(auth.uid(),'should fail');
    RAISE EXCEPTION 'Frozen JWT could recreate data';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name) VALUES('wine-labels',auth.uid()::text||'/blocked.jpg');
    RAISE EXCEPTION 'Frozen JWT could upload';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='11111111-1111-4111-8111-111111111101';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.wines WHERE user_id='11111111-1111-4111-8111-111111111101') THEN RAISE EXCEPTION 'Wine survived auth cascade'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.privacy_erasure_receipts WHERE user_id='11111111-1111-4111-8111-111111111101') THEN RAISE EXCEPTION 'Erasure ledger lost on cascade'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
DO $$ BEGIN
  IF public.privacy_account_active(auth.uid()) THEN RAISE EXCEPTION 'Deleted JWT still active'; END IF;
  BEGIN
    INSERT INTO public.profiles(id,display_name) VALUES(auth.uid(),'recreated');
    RAISE EXCEPTION 'Deleted JWT recreated profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES('11111111-1111-4111-8111-111111111101','restored@example.test');
DO $$ BEGIN
  IF public.privacy_account_active('11111111-1111-4111-8111-111111111101') THEN
    RAISE EXCEPTION 'Retained receipt did not block restored account';
  END IF;
END $$;
ROLLBACK;
