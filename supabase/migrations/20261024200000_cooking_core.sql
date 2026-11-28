-- Additive, private cooking domain. Disabled until explicitly enabled in a verified test target.
CREATE TABLE public.kitchen_config (id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false);
INSERT INTO public.kitchen_config(id,enabled) VALUES(true,false);
ALTER TABLE public.kitchen_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.kitchen_config TO service_role;

CREATE FUNCTION public.kitchen_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.kitchen_config WHERE enabled)
   AND public.privacy_account_active(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.kitchen_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kitchen_access() TO authenticated,service_role;

CREATE FUNCTION public.kitchen_valid_recipe(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb;
BEGIN
 IF d IS NULL OR jsonb_typeof(d)<>'object' OR octet_length(d::text)>65536 OR
    NOT (d ?& ARRAY['title','description','servings','totalMinutes','image','sourceNote','notes','ingredients','steps']) OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE k<>ALL(ARRAY['title','description','servings','totalMinutes','image','sourceNote','notes','ingredients','steps'])) OR
    jsonb_typeof(d->'title')<>'string' OR length(btrim(d->>'title')) NOT BETWEEN 1 AND 140 OR
    jsonb_typeof(d->'description')<>'string' OR length(d->>'description')>1200 OR
    jsonb_typeof(d->'sourceNote')<>'string' OR length(d->>'sourceNote')>400 OR
    jsonb_typeof(d->'notes')<>'string' OR length(d->>'notes')>2000 OR
    jsonb_typeof(d->'image')<>'string' OR d->>'image'<>ALL(ARRAY['cauliflower','pasta','salad','none']) OR
    jsonb_typeof(d->'servings')<>'number' OR jsonb_typeof(d->'totalMinutes')<>'number' OR
    (d->>'servings')!~'^[0-9]+$' OR (d->>'servings')::int NOT BETWEEN 1 AND 24 OR
    (d->>'totalMinutes')!~'^[0-9]+$' OR (d->>'totalMinutes')::int NOT BETWEEN 1 AND 1440 OR
    jsonb_typeof(d->'ingredients')<>'array' OR jsonb_array_length(d->'ingredients') NOT BETWEEN 1 AND 80 OR
    jsonb_typeof(d->'steps')<>'array' OR jsonb_array_length(d->'steps') NOT BETWEEN 1 AND 40 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'ingredients') LOOP
   IF NOT(item ?& ARRAY['id','name','amount','unit']) OR (item->>'id')::uuid IS NULL OR
      jsonb_typeof(item->'name')<>'string' OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 120 OR
      jsonb_typeof(item->'amount')<>'number' OR (item->>'amount')::numeric NOT BETWEEN 0 AND 100000 OR
      jsonb_typeof(item->'unit')<>'string' OR item->>'unit'<>ALL(ARRAY['g','kg','ml','dl','l','tsp','tbsp','pcs','pinch']) THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'steps') LOOP
   IF NOT(item ?& ARRAY['id','title','text','timerSeconds']) OR (item->>'id')::uuid IS NULL OR
      jsonb_typeof(item->'title')<>'string' OR length(btrim(item->>'title')) NOT BETWEEN 1 AND 140 OR
      jsonb_typeof(item->'text')<>'string' OR length(btrim(item->>'text')) NOT BETWEEN 1 AND 2000 OR
      (item->'timerSeconds'<>'null'::jsonb AND ((item->>'timerSeconds')!~'^[0-9]+$' OR (item->>'timerSeconds')::int NOT BETWEEN 1 AND 21600)) THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(d->'ingredients'))
    AND (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(d->'steps'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_valid_recipe(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.kitchen_recipes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), current_version_id uuid,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE TABLE public.kitchen_recipe_versions (
 id uuid PRIMARY KEY, recipe_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL CHECK(public.kitchen_valid_recipe(document)),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(recipe_id,user_id) REFERENCES public.kitchen_recipes(id,user_id) ON DELETE CASCADE,
 UNIQUE(recipe_id,revision), UNIQUE(id,user_id), UNIQUE(recipe_id,id,user_id)
);
ALTER TABLE public.kitchen_recipes ADD CONSTRAINT kitchen_current_version_owner
 FOREIGN KEY(id,current_version_id,user_id) REFERENCES public.kitchen_recipe_versions(recipe_id,id,user_id)
 DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.cooking_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipe_version_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), state jsonb NOT NULL,
 last_request_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(recipe_version_id,user_id) REFERENCES public.kitchen_recipe_versions(id,user_id), UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX cooking_one_active ON public.cooking_sessions(user_id)
 WHERE state->>'status' IN ('running','paused');
CREATE TABLE public.cooking_feedback (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL UNIQUE, rating integer CHECK(rating BETWEEN 1 AND 5),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,user_id) REFERENCES public.cooking_sessions(id,user_id) ON DELETE CASCADE
);
CREATE INDEX kitchen_recipes_owner ON public.kitchen_recipes(user_id,updated_at DESC);
CREATE INDEX kitchen_versions_owner ON public.kitchen_recipe_versions(user_id,recipe_id);
CREATE INDEX cooking_sessions_owner ON public.cooking_sessions(user_id,updated_at DESC);
CREATE INDEX cooking_feedback_owner ON public.cooking_feedback(user_id);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['kitchen_recipes','kitchen_recipe_versions','cooking_sessions','cooking_feedback'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY kitchen_owner_read ON public.%I FOR SELECT TO authenticated USING (user_id=auth.uid() AND public.kitchen_access())',tab);
 END LOOP;
END $$;

CREATE FUNCTION public.kitchen_save_recipe(_recipe_id uuid,_version_id uuid,_expected_revision integer,_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.kitchen_recipes; v public.kitchen_recipe_versions;
BEGIN
 IF NOT public.kitchen_access() THEN RAISE EXCEPTION 'kitchen_unavailable' USING ERRCODE='42501'; END IF;
 IF _recipe_id IS NULL OR _version_id IS NULL OR _expected_revision IS NULL OR _expected_revision<0 OR NOT public.kitchen_valid_recipe(_document) THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
 IF _expected_revision=0 THEN
  IF (SELECT count(*) FROM public.kitchen_recipes WHERE user_id=auth.uid())>=200 THEN RAISE EXCEPTION 'kitchen_limit'; END IF;
  INSERT INTO public.kitchen_recipes(id,user_id) VALUES(_recipe_id,auth.uid()) ON CONFLICT(id) DO NOTHING;
 END IF;
 SELECT * INTO r FROM public.kitchen_recipes WHERE id=_recipe_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.archived THEN RAISE EXCEPTION 'kitchen_not_found' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.kitchen_recipe_versions WHERE id=_version_id AND recipe_id=r.id AND user_id=auth.uid();
 IF FOUND THEN
  IF v.document<>_document THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
  RETURN to_jsonb(v);
 END IF;
 IF r.revision<>_expected_revision THEN RAISE EXCEPTION 'kitchen_conflict'; END IF;
 IF r.revision>=100 THEN RAISE EXCEPTION 'kitchen_limit'; END IF;
 INSERT INTO public.kitchen_recipe_versions(id,recipe_id,user_id,revision,document)
  VALUES(_version_id,r.id,auth.uid(),r.revision+1,_document) RETURNING * INTO v;
 UPDATE public.kitchen_recipes SET current_version_id=v.id,revision=v.revision,updated_at=now() WHERE id=r.id;
 RETURN to_jsonb(v);
END $$;

CREATE FUNCTION public.kitchen_valid_state(s jsonb,d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE t jsonb;
BEGIN
 IF s IS NULL OR jsonb_typeof(s)<>'object' OR octet_length(s::text)>32768 OR NOT(s ?& ARRAY['status','activeStep','servings','checkedIngredientIds','timers']) OR
    jsonb_typeof(s->'status')<>'string' OR s->>'status'<>ALL(ARRAY['running','paused','completed','abandoned']) OR
    jsonb_typeof(s->'activeStep')<>'number' OR jsonb_typeof(s->'servings')<>'number' OR
    (s->>'activeStep')!~'^[0-9]+$' OR (s->>'activeStep')::int NOT BETWEEN 0 AND jsonb_array_length(d->'steps')-1 OR
    (s->>'servings')!~'^[0-9]+$' OR (s->>'servings')::int NOT BETWEEN 1 AND 24 OR
    jsonb_typeof(s->'checkedIngredientIds')<>'array' OR jsonb_array_length(s->'checkedIngredientIds')>80 OR
    jsonb_typeof(s->'timers')<>'array' OR jsonb_array_length(s->'timers')>8 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(s->'checkedIngredientIds') i WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(d->'ingredients') v WHERE v->>'id'=i)) THEN RETURN false; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(s->'timers') LOOP
   IF NOT(t ?& ARRAY['id','name','durationMs','deadlineMs','pausedMs','resumeOnSession']) OR (t->>'id')::uuid IS NULL OR
      jsonb_typeof(t->'name')<>'string' OR length(btrim(t->>'name')) NOT BETWEEN 1 AND 60 OR
      jsonb_typeof(t->'durationMs')<>'number' OR jsonb_typeof(t->'pausedMs')<>'number' OR
      (t->>'durationMs')!~'^[0-9]+$' OR (t->>'durationMs')::bigint NOT BETWEEN 1000 AND 21600000 OR
      (t->>'pausedMs')!~'^[0-9]+$' OR (t->>'pausedMs')::bigint NOT BETWEEN 0 AND (t->>'durationMs')::bigint OR
      jsonb_typeof(t->'resumeOnSession')<>'boolean' OR
      (t->'deadlineMs'<>'null'::jsonb AND ((t->>'deadlineMs')!~'^[0-9]+$' OR (t->>'deadlineMs')::bigint NOT BETWEEN 0 AND 4102444800000)) OR
      (s->>'status'<>'running' AND t->'deadlineMs'<>'null'::jsonb) THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(s->'timers'))
   AND (SELECT count(*)=count(DISTINCT value) FROM jsonb_array_elements_text(s->'checkedIngredientIds'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_valid_state(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.kitchen_save_session(_id uuid,_version_id uuid,_expected_revision integer,_request_id uuid,_state jsonb,_feedback jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.kitchen_recipe_versions; s public.cooking_sessions;
BEGIN
 IF NOT public.kitchen_access() THEN RAISE EXCEPTION 'kitchen_unavailable' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _request_id IS NULL OR _expected_revision IS NULL OR _expected_revision<0 THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
 SELECT * INTO v FROM public.kitchen_recipe_versions WHERE id=_version_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'kitchen_not_found' USING ERRCODE='42501'; END IF;
 IF NOT public.kitchen_valid_state(_state,v.document) THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
 IF _feedback IS NOT NULL AND (jsonb_typeof(_feedback)<>'object' OR NOT(_feedback ?& ARRAY['rating','note']) OR
     _state->>'status'<>'completed' OR jsonb_typeof(_feedback->'note')<>'string' OR length(_feedback->>'note')>1000 OR
     (_feedback->'rating'<>'null'::jsonb AND ((_feedback->>'rating')!~'^[0-9]+$' OR (_feedback->>'rating')::int NOT BETWEEN 1 AND 5))) THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
 SELECT * INTO s FROM public.cooking_sessions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF FOUND THEN
   IF s.recipe_version_id<>v.id THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
   IF s.last_request_id=_request_id THEN
     IF s.state<>_state THEN RAISE EXCEPTION 'kitchen_invalid'; END IF;
     RETURN to_jsonb(s);
   END IF;
   IF s.revision<>_expected_revision THEN RAISE EXCEPTION 'kitchen_conflict'; END IF;
   IF s.state->>'status' IN ('completed','abandoned') AND s.state->>'status'<>_state->>'status' THEN RAISE EXCEPTION 'kitchen_finished'; END IF;
   UPDATE public.cooking_sessions SET state=_state,revision=revision+1,last_request_id=_request_id,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSE
   IF _expected_revision<>0 THEN RAISE EXCEPTION 'kitchen_conflict'; END IF;
   IF (SELECT count(*) FROM public.cooking_sessions WHERE user_id=auth.uid())>=1000 THEN RAISE EXCEPTION 'kitchen_limit'; END IF;
   INSERT INTO public.cooking_sessions(id,user_id,recipe_version_id,revision,state,last_request_id)
    VALUES(_id,auth.uid(),v.id,1,_state,_request_id) RETURNING * INTO s;
 END IF;
 IF _feedback IS NOT NULL THEN
   INSERT INTO public.cooking_feedback(id,user_id,session_id,rating,note) VALUES(s.id,auth.uid(),s.id,(_feedback->>'rating')::int,_feedback->>'note')
    ON CONFLICT(session_id) DO UPDATE SET rating=excluded.rating,note=excluded.note;
 END IF;
 RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.kitchen_archive_recipe(_id uuid,_expected_revision integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.kitchen_access() THEN RAISE EXCEPTION 'kitchen_unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.kitchen_recipes SET archived=true,revision=revision+1,updated_at=now() WHERE id=_id AND user_id=auth.uid() AND revision=_expected_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'kitchen_conflict'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_save_recipe(uuid,uuid,integer,jsonb),public.kitchen_save_session(uuid,uuid,integer,uuid,jsonb,jsonb),public.kitchen_archive_recipe(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kitchen_save_recipe(uuid,uuid,integer,jsonb),public.kitchen_save_session(uuid,uuid,integer,uuid,jsonb,jsonb),public.kitchen_archive_recipe(uuid,integer) TO authenticated;
