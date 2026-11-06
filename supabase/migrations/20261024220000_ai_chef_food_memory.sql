-- Additive test-only Chef domain. Both independent gates default closed.
ALTER TABLE public.kitchen_config ADD COLUMN chef_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.cooking_feedback ADD CONSTRAINT cooking_feedback_owner_key UNIQUE(id,user_id);
CREATE FUNCTION public.chef_user_active(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=u)
 AND EXISTS(SELECT 1 FROM public.kitchen_config WHERE enabled AND chef_enabled)
 AND public.privacy_account_active(u);
$$;
CREATE FUNCTION public.chef_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.chef_user_active(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.chef_user_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chef_user_active(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.chef_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chef_access() TO authenticated,service_role;

CREATE TABLE public.food_memory_state (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), reset_at timestamptz NOT NULL DEFAULT 'epoch'
);
CREATE TABLE public.food_signals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN ('statement','correction','feedback')),
 source_key text NOT NULL CHECK(length(source_key)<=100), source_feedback_id uuid,
 attribute text NOT NULL CHECK(attribute IN ('ingredient','cuisine','method','texture','equipment')),
 value text NOT NULL CHECK(length(value) BETWEEN 1 AND 80 AND value=btrim(value)),
 direction integer NOT NULL CHECK(direction IN (-1,1)),
 source_excerpt text NOT NULL CHECK(length(source_excerpt)<=400), source_title text NOT NULL CHECK(length(source_title)<=140),
 confidence numeric NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 status text NOT NULL CHECK(status IN ('pending','confirmed','corrected')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_feedback_id,user_id) REFERENCES public.cooking_feedback(id,user_id) ON DELETE CASCADE,
 CHECK((source_kind='feedback')=(source_feedback_id IS NOT NULL)),
 UNIQUE(user_id,source_key,attribute,value,direction)
);
CREATE TABLE public.food_memory_tombstones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 attribute text NOT NULL, value_hash text NOT NULL CHECK(value_hash~'^[a-f0-9]{64}$'),
 UNIQUE(user_id,attribute,value_hash)
);
CREATE TABLE public.chef_conversations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 140), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE TABLE public.chef_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL, turn integer NOT NULL CHECK(turn>0), role text NOT NULL CHECK(role IN ('user','assistant')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 12000), model text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(conversation_id,user_id) REFERENCES public.chef_conversations(id,user_id) ON DELETE CASCADE,
 UNIQUE(conversation_id,turn,role)
);
CREATE TABLE public.chef_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('chat','generate','adapt','extract')),
 input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'), memory_revision bigint NOT NULL,
 conversation_id uuid, conversation_revision integer,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
 response jsonb CHECK(octet_length(response::text)<=80000), error_code text,
 model text, input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
 duration_ms integer CHECK(duration_ms>=0), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE INDEX food_signals_owner ON public.food_signals(user_id,status);
CREATE INDEX chef_messages_owner ON public.chef_messages(user_id,conversation_id,turn DESC);
CREATE INDEX chef_requests_owner ON public.chef_requests(user_id,expires_at);
CREATE INDEX chef_conversations_owner ON public.chef_conversations(user_id,updated_at DESC);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['food_memory_state','food_signals','food_memory_tombstones','chef_conversations','chef_messages','chef_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  IF tab<>'food_memory_tombstones' THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
   EXECUTE format('CREATE POLICY chef_owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.chef_access()%s)',tab,
    CASE WHEN tab='chef_requests' THEN ' AND status=''completed'' AND expires_at>now() AND memory_revision=COALESCE((SELECT revision FROM public.food_memory_state WHERE user_id=auth.uid()),0)' ELSE '' END);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.reset_food_memory(u uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.food_memory_state(user_id) VALUES(u) ON CONFLICT(user_id) DO NOTHING;
 PERFORM 1 FROM public.food_memory_state WHERE user_id=u FOR UPDATE;
 DELETE FROM public.food_signals WHERE user_id=u;
 DELETE FROM public.food_memory_tombstones WHERE user_id=u;
 DELETE FROM public.chef_conversations WHERE user_id=u;
 DELETE FROM public.chef_requests WHERE user_id=u;
 UPDATE public.food_memory_state SET revision=revision+1,reset_at=now() WHERE user_id=u;
END $$;
REVOKE ALL ON FUNCTION public.reset_food_memory(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_food_memory(uuid) TO service_role;

CREATE FUNCTION public.food_memory_change(_action text,_id uuid,_revision integer DEFAULT 0,_entry jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); s public.food_signals; a text; v text; d integer;
BEGIN
 IF NOT public.chef_access() THEN RAISE EXCEPTION 'chef_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.food_memory_state(user_id) VALUES(u) ON CONFLICT(user_id) DO NOTHING;
 PERFORM 1 FROM public.food_memory_state WHERE user_id=u FOR UPDATE;
 IF _action='reset' THEN PERFORM public.reset_food_memory(u); RETURN; END IF;
 IF _action IN ('confirm','correct','forget') THEN
  SELECT * INTO s FROM public.food_signals WHERE id=_id AND user_id=u FOR UPDATE;
  IF NOT FOUND OR s.revision<>_revision THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
 END IF;
 IF _action IN ('add','correct') THEN
  a:=_entry->>'attribute'; v:=lower(regexp_replace(btrim(_entry->>'value'),'\s+',' ','g')); d:=(_entry->>'direction')::integer;
  IF _entry IS NULL OR jsonb_typeof(_entry)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(_entry))<>3 OR
   a IS NULL OR a NOT IN ('ingredient','cuisine','method','texture','equipment') OR v IS NULL OR length(v) NOT BETWEEN 1 AND 80 OR
   d IS NULL OR d NOT IN (-1,1) OR v~*'allerg|anafyl|anaphyl|diabet|gravid|pregnan|insulin|diagnos|medicin|medical|celiak|celiac|njursjuk|kidney disease'
   THEN RAISE EXCEPTION 'chef_invalid'; END IF;
  IF _action='correct' THEN
   UPDATE public.food_signals SET status='corrected',revision=revision+1 WHERE user_id=u AND attribute=s.attribute AND value=s.value;
  END IF;
  DELETE FROM public.food_memory_tombstones WHERE user_id=u AND attribute=a AND value_hash=encode(sha256(convert_to(v,'UTF8')),'hex');
  INSERT INTO public.food_signals(id,user_id,source_kind,source_key,attribute,value,direction,source_excerpt,source_title,confidence,status)
   VALUES(CASE WHEN _action='add' THEN _id ELSE gen_random_uuid() END,u,CASE WHEN _action='add' THEN 'statement' ELSE 'correction' END,
     'statement:'||_id::text,a,v,d,v,'Angivet av dig',1,'confirmed');
 ELSIF _action='confirm' THEN
  IF s.status<>'pending' THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
  UPDATE public.food_signals SET status='confirmed',revision=revision+1 WHERE id=s.id;
 ELSIF _action='forget' THEN
  INSERT INTO public.food_memory_tombstones(user_id,attribute,value_hash) VALUES(u,s.attribute,encode(sha256(convert_to(s.value,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
  DELETE FROM public.food_signals WHERE user_id=u AND attribute=s.attribute AND value=s.value;
 ELSE RAISE EXCEPTION 'chef_invalid'; END IF;
 IF _action IN ('forget','correct') THEN
  DELETE FROM public.chef_conversations WHERE user_id=u;
  DELETE FROM public.chef_requests WHERE user_id=u;
 END IF;
 UPDATE public.food_memory_state SET revision=revision+1 WHERE user_id=u;
END $$;
REVOKE ALL ON FUNCTION public.food_memory_change(text,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.food_memory_change(text,uuid,integer,jsonb) TO authenticated;

CREATE FUNCTION public.chef_claim_request(u uuid,r uuid,a text,h text,c uuid DEFAULT NULL,cr integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.food_memory_state; old public.chef_requests; cv public.chef_conversations; q jsonb;
BEGIN
 IF NOT public.chef_user_active(u) THEN RAISE EXCEPTION 'chef_denied' USING ERRCODE='42501'; END IF;
 IF a NOT IN ('chat','generate','adapt','extract') OR h!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'chef_invalid'; END IF;
 INSERT INTO public.food_memory_state(user_id) VALUES(u) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO s FROM public.food_memory_state WHERE user_id=u FOR UPDATE;
 SELECT * INTO old FROM public.chef_requests WHERE id=r;
 IF FOUND THEN
  IF old.user_id<>u OR old.input_hash<>h OR old.action<>a OR old.expires_at<=now() OR old.memory_revision<>s.revision THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
  IF old.status='completed' THEN RETURN jsonb_build_object('cached',old.response); END IF;
  RAISE EXCEPTION 'chef_request_unavailable' USING ERRCODE='40001';
 END IF;
 IF a='chat' THEN
  IF c IS NULL OR cr IS NULL OR cr<0 THEN RAISE EXCEPTION 'chef_invalid'; END IF;
  SELECT * INTO cv FROM public.chef_conversations WHERE id=c;
  IF FOUND THEN
   IF cv.user_id<>u OR cv.revision<>cr THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
  ELSIF cr<>0 THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.chef_requests WHERE user_id=u AND conversation_id=c AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'chef_busy' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(61024220000);
 IF (SELECT COALESCE(sum(request_count),0) FROM public.ai_rate_limits WHERE function_name='chef:daily' AND window_started_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=1000 THEN RAISE EXCEPTION 'chef_quota'; END IF;
 SELECT to_jsonb(x) INTO q FROM public.consume_ai_quota(u,'chef:'||a,CASE WHEN a='chat' THEN 20 ELSE 5 END,300) x;
 IF NOT COALESCE((q->>'allowed')::boolean,false) THEN RAISE EXCEPTION 'chef_quota' USING ERRCODE='P0001'; END IF;
 SELECT to_jsonb(x) INTO q FROM public.consume_ai_quota(u,'chef:daily',100,86400) x;
 IF NOT COALESCE((q->>'allowed')::boolean,false) THEN RAISE EXCEPTION 'chef_quota' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.chef_requests(id,user_id,action,input_hash,memory_revision,conversation_id,conversation_revision) VALUES(r,u,a,h,s.revision,c,cr);
 RETURN jsonb_build_object('memoryRevision',s.revision);
END $$;
REVOKE ALL ON FUNCTION public.chef_claim_request(uuid,uuid,text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chef_claim_request(uuid,uuid,text,text,uuid,integer) TO service_role;

CREATE FUNCTION public.chef_finish_request(u uuid,r uuid,result jsonb,prompt text,feedback uuid DEFAULT NULL,candidates jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.chef_requests; st public.food_memory_state; f public.cooking_feedback; item jsonb; v text; a text; title text; inserted integer:=0; affected integer;
BEGIN
 SELECT * INTO st FROM public.food_memory_state WHERE user_id=u FOR UPDATE;
 SELECT * INTO req FROM public.chef_requests WHERE id=r AND user_id=u FOR UPDATE;
 IF NOT FOUND OR req.status<>'pending' OR req.expires_at<=now() OR st.revision<>req.memory_revision OR NOT public.chef_user_active(u) THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
 IF result IS NULL OR octet_length(result::text)>80000 OR length(prompt)>2000 THEN RAISE EXCEPTION 'chef_invalid'; END IF;
 IF req.action='chat' THEN
  IF length(result->>'answer') NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'chef_invalid'; END IF;
  INSERT INTO public.chef_conversations(id,user_id,title) VALUES(req.conversation_id,u,left(prompt,140)) ON CONFLICT(id) DO NOTHING;
  UPDATE public.chef_conversations SET revision=revision+1,updated_at=now() WHERE id=req.conversation_id AND user_id=u AND revision=req.conversation_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'chef_conflict' USING ERRCODE='40001'; END IF;
  INSERT INTO public.chef_messages(user_id,conversation_id,turn,role,content,model) VALUES
   (u,req.conversation_id,req.conversation_revision+1,'user',prompt,NULL),
   (u,req.conversation_id,req.conversation_revision+1,'assistant',result->>'answer',result->>'model');
 ELSIF req.action IN ('generate','adapt') THEN
  IF NOT public.kitchen_valid_recipe(result->'draft') THEN RAISE EXCEPTION 'chef_invalid'; END IF;
 ELSIF req.action='extract' THEN
  SELECT * INTO f FROM public.cooking_feedback WHERE id=feedback AND user_id=u AND created_at>st.reset_at;
  IF NOT FOUND OR f.note~*'allerg|anafyl|anaphyl|diabet|gravid|pregnan|insulin|diagnos|medicin|medical|celiak|celiac|njursjuk|kidney disease' OR
    jsonb_typeof(candidates)<>'array' OR jsonb_array_length(candidates)>10 THEN RAISE EXCEPTION 'chef_invalid'; END IF;
  SELECT v.document->>'title' INTO title FROM public.cooking_sessions s JOIN public.kitchen_recipe_versions v ON v.id=s.recipe_version_id AND v.user_id=s.user_id WHERE s.id=f.session_id AND s.user_id=u;
  FOR item IN SELECT value FROM jsonb_array_elements(candidates) LOOP
   a:=item->>'attribute'; v:=lower(regexp_replace(btrim(item->>'value'),'\s+',' ','g'));
   IF a IS NULL OR a NOT IN ('ingredient','cuisine','method','texture','equipment') OR v IS NULL OR length(v) NOT BETWEEN 1 AND 80 OR (item->>'direction')::integer NOT IN (-1,1) OR
    length(item->>'quote') NOT BETWEEN 1 AND 400 OR position(item->>'quote' in f.note)=0 OR
    v~*'allerg|anafyl|anaphyl|diabet|gravid|pregnan|insulin|diagnos|medicin|medical|celiak|celiac|njursjuk|kidney disease'
    THEN RAISE EXCEPTION 'chef_invalid'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.food_memory_tombstones WHERE user_id=u AND attribute=a AND value_hash=encode(sha256(convert_to(v,'UTF8')),'hex')) THEN
    INSERT INTO public.food_signals(user_id,source_kind,source_key,source_feedback_id,attribute,value,direction,source_excerpt,source_title,confidence,status)
     VALUES(u,'feedback','feedback:'||f.id::text,f.id,a,v,(item->>'direction')::integer,item->>'quote',title,0.6,'pending') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected=ROW_COUNT; inserted:=inserted+affected;
   END IF;
  END LOOP;
  IF inserted>0 THEN UPDATE public.food_memory_state SET revision=revision+1 WHERE user_id=u RETURNING * INTO st; END IF;
  result:=result||jsonb_build_object('candidateCount',inserted);
 END IF;
 UPDATE public.chef_requests SET status='completed',response=result,memory_revision=st.revision,model=result->>'model',
   input_tokens=(result->>'inputTokens')::integer,output_tokens=(result->>'outputTokens')::integer,duration_ms=(result->>'durationMs')::integer WHERE id=r;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.chef_finish_request(uuid,uuid,jsonb,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chef_finish_request(uuid,uuid,jsonb,text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.chef_fail_request(u uuid,r uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.chef_requests SET status='failed',error_code='chef_failed' WHERE id=r AND user_id=u AND status='pending';
$$;
REVOKE ALL ON FUNCTION public.chef_fail_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chef_fail_request(uuid,uuid) TO service_role;

-- Reuse the existing account-memory reset, retaining its established wine operations.
ALTER FUNCTION public.reset_privacy_memory(uuid) RENAME TO reset_wine_privacy_memory;
CREATE FUNCTION public.reset_privacy_memory(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.reset_wine_privacy_memory(_user_id);
 PERFORM public.reset_food_memory(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.reset_privacy_memory(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_privacy_memory(uuid) TO service_role;

CREATE FUNCTION public.run_chef_retention(_execute boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requests integer; conversations integer;
BEGIN
 SELECT count(*) INTO requests FROM (SELECT id FROM public.chef_requests WHERE expires_at<=now() LIMIT 1000) t;
 SELECT count(*) INTO conversations FROM (SELECT id FROM public.chef_conversations WHERE updated_at<now()-interval '90 days' LIMIT 1000) t;
 IF _execute THEN
  DELETE FROM public.chef_requests WHERE id IN (SELECT id FROM public.chef_requests WHERE expires_at<=now() ORDER BY expires_at LIMIT 1000);
  DELETE FROM public.chef_conversations WHERE id IN (SELECT id FROM public.chef_conversations WHERE updated_at<now()-interval '90 days' ORDER BY updated_at LIMIT 1000);
 END IF;
 RETURN jsonb_build_object('requests',requests,'conversations',conversations,'moreWork',requests=1000 OR conversations=1000);
END $$;
REVOKE ALL ON FUNCTION public.run_chef_retention(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_chef_retention(boolean) TO service_role;
