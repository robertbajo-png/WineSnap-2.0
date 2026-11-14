-- Independent, opt-in test domain. Never grants access to another member's cellar or memory.
ALTER TABLE public.kitchen_config ADD COLUMN meals_enabled boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.meals_user_active(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.chef_user_active(u) AND EXISTS(SELECT 1 FROM public.kitchen_config WHERE meals_enabled);
$$;
CREATE FUNCTION public.meals_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.meals_user_active(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.meals_user_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meals_user_active(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.meals_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.meals_access() TO authenticated,service_role;

CREATE TABLE public.kitchen_households (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kitchen_household_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES public.kitchen_households(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 60),
 adult_confirmed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(household_id,user_id)
);
CREATE TABLE public.kitchen_household_invites (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES public.kitchen_households(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
 revoked_at timestamptz, used_at timestamptz, used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.kitchen_valid_diner(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb; seen text[]:=ARRAY[]::text[]; k text;
BEGIN
 IF d IS NULL OR jsonb_typeof(d)<>'object' OR NOT (d ?& ARRAY['name','kind','preferences']) OR (SELECT count(*) FROM jsonb_object_keys(d))<>3
 OR jsonb_typeof(d->'name') IS DISTINCT FROM 'string' OR length(btrim(d->>'name')) NOT BETWEEN 1 AND 60
 OR jsonb_typeof(d->'kind') IS DISTINCT FROM 'string' OR d->>'kind' NOT IN ('adult','child') OR jsonb_typeof(d->'preferences') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'preferences')>20
 THEN RETURN false; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(d->'preferences') LOOP
  IF jsonb_typeof(p)<>'object' OR NOT (p ?& ARRAY['attribute','value','direction']) OR (SELECT count(*) FROM jsonb_object_keys(p))<>3
  OR jsonb_typeof(p->'attribute') IS DISTINCT FROM 'string' OR p->>'attribute' NOT IN ('ingredient','cuisine','method','texture','equipment')
  OR jsonb_typeof(p->'value') IS DISTINCT FROM 'string' OR length(btrim(p->>'value')) NOT BETWEEN 1 AND 80
  OR p->>'value'<>lower(btrim(p->>'value')) OR p->>'value' ~* '(allerg|anafyl|anaphyl|diabet|insulin|celiak|coeliac|celiac|gravid|pregnan|diagnos|medicin|medical|njursjuk|kidney disease|eating.disorder|atstorn|ätstör)'
  OR jsonb_typeof(p->'direction') IS DISTINCT FROM 'number' OR p->'direction' NOT IN ('1'::jsonb,'-1'::jsonb) THEN RETURN false; END IF;
  k:=(p->>'attribute')||':'||(p->>'value');
  IF k=ANY(seen) THEN RETURN false; END IF;
  seen:=array_append(seen,k);
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE TABLE public.kitchen_diners (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 -- Deleting a household must not delete a peer's personal profiles.
 household_id uuid REFERENCES public.kitchen_households(id) ON DELETE SET NULL,
 shared boolean NOT NULL DEFAULT false, document jsonb NOT NULL CHECK(public.kitchen_valid_diner(document)),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wines ADD CONSTRAINT wines_meal_owner_key UNIQUE(id,user_id);
CREATE TABLE public.meal_wine_links (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, wine_id uuid NOT NULL,
 food_rating integer CHECK(food_rating BETWEEN 1 AND 5), wine_rating integer CHECK(wine_rating BETWEEN 1 AND 5),
 pairing_rating integer CHECK(pairing_rating BETWEEN 1 AND 5), note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,user_id) REFERENCES public.cooking_sessions(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(wine_id,user_id) REFERENCES public.wines(id,user_id) ON DELETE CASCADE,
 UNIQUE(session_id,user_id)
);
CREATE INDEX kitchen_diners_owner ON public.kitchen_diners(user_id);
CREATE INDEX kitchen_diners_group ON public.kitchen_diners(household_id) WHERE shared;
CREATE INDEX kitchen_households_owner ON public.kitchen_households(user_id);
CREATE INDEX kitchen_members_owner ON public.kitchen_household_members(user_id);
CREATE INDEX kitchen_invites_owner ON public.kitchen_household_invites(user_id,expires_at);
CREATE INDEX meal_links_owner ON public.meal_wine_links(user_id,updated_at DESC);

CREATE FUNCTION public.kitchen_household_member(g uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.meals_access() AND EXISTS(SELECT 1 FROM public.kitchen_household_members m JOIN public.kitchen_households h ON h.id=m.household_id
 WHERE m.household_id=g AND m.user_id=auth.uid() AND public.meals_user_active(h.user_id));
$$;
CREATE FUNCTION public.kitchen_household_owner(g uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.meals_access() AND EXISTS(SELECT 1 FROM public.kitchen_households WHERE id=g AND user_id=auth.uid());
$$;
CREATE FUNCTION public.kitchen_diner_visible(g uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.kitchen_household_member(g) AND public.meals_user_active(u) AND EXISTS(
 SELECT 1 FROM public.kitchen_household_members WHERE household_id=g AND user_id=u);
$$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['kitchen_households','kitchen_household_members','kitchen_household_invites','kitchen_diners','meal_wine_links'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  IF tab<>'kitchen_household_invites' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab); END IF;
 END LOOP;
END $$;
GRANT SELECT(id,user_id,household_id,expires_at,revoked_at,used_at,created_at) ON public.kitchen_household_invites TO authenticated;
CREATE POLICY meals_group_read ON public.kitchen_households FOR SELECT TO authenticated USING(public.kitchen_household_member(id));
CREATE POLICY meals_member_read ON public.kitchen_household_members FOR SELECT TO authenticated USING(public.meals_access() AND (user_id=auth.uid() OR public.kitchen_household_owner(household_id)));
CREATE POLICY meals_invite_read ON public.kitchen_household_invites FOR SELECT TO authenticated USING(public.kitchen_household_owner(household_id));
CREATE POLICY meals_diner_read ON public.kitchen_diners FOR SELECT TO authenticated USING(public.meals_access() AND (user_id=auth.uid() OR (shared AND public.kitchen_diner_visible(household_id,user_id))));
CREATE POLICY meals_link_read ON public.meal_wine_links FOR SELECT TO authenticated USING(public.meals_access() AND user_id=auth.uid());

CREATE FUNCTION public.kitchen_family_change(_action text,_id uuid,_revision integer,_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); h public.kitchen_households; p public.kitchen_diners; g uuid; n text;
BEGIN
 IF NOT public.meals_access() THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _revision IS NULL OR _revision<0 OR _data IS NULL THEN RAISE EXCEPTION 'meals_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,2504));
 IF _action='create_household' THEN
  n:=btrim(_data->>'name');
  IF _revision<>0 OR n IS NULL OR length(n) NOT BETWEEN 1 AND 80 OR (_data->'adultConfirmed') IS DISTINCT FROM 'true'::jsonb
   OR COALESCE(length(btrim(_data->>'displayName')),0) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'meals_invalid'; END IF;
  SELECT * INTO h FROM public.kitchen_households WHERE id=_id;
  IF FOUND THEN
   IF h.user_id=u AND h.name=n THEN RETURN; END IF;
   RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409';
  END IF;
  IF (SELECT count(*) FROM public.kitchen_household_members WHERE user_id=u)>=5 THEN RAISE EXCEPTION 'meals_limit'; END IF;
  INSERT INTO public.kitchen_households(id,user_id,name) VALUES(_id,u,n);
  INSERT INTO public.kitchen_household_members(household_id,user_id,display_name,adult_confirmed_at) VALUES(_id,u,btrim(_data->>'displayName'),now());
 ELSIF _action IN ('rename_household','delete_household','remove_member','leave_household') THEN
  SELECT * INTO h FROM public.kitchen_households WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR h.revision<>_revision THEN RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409'; END IF;
  IF _action='leave_household' THEN
   IF h.user_id=u OR NOT public.kitchen_household_member(_id) THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
   DELETE FROM public.kitchen_household_members WHERE household_id=_id AND user_id=u;
  ELSE
   IF h.user_id<>u THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
   IF _action='delete_household' THEN DELETE FROM public.kitchen_households WHERE id=_id; RETURN;
   ELSIF _action='rename_household' THEN
    n:=btrim(_data->>'name'); IF n IS NULL OR length(n) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'meals_invalid'; END IF;
    UPDATE public.kitchen_households SET name=n WHERE id=_id;
   ELSE
    g:=(_data->>'userId')::uuid;
    IF g IS NULL OR g=u THEN RAISE EXCEPTION 'meals_invalid'; END IF;
    DELETE FROM public.kitchen_household_members WHERE household_id=_id AND user_id=g;
    UPDATE public.kitchen_household_invites SET revoked_at=now() WHERE household_id=_id AND used_at IS NULL AND revoked_at IS NULL;
   END IF;
  END IF;
  UPDATE public.kitchen_households SET revision=revision+1 WHERE id=_id;
 ELSIF _action IN ('save_diner','delete_diner') THEN
  SELECT * INTO p FROM public.kitchen_diners WHERE id=_id AND user_id=u FOR UPDATE;
  IF (NOT FOUND AND _revision<>0) OR (FOUND AND p.revision<>_revision) THEN RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409'; END IF;
  IF _action='delete_diner' THEN DELETE FROM public.kitchen_diners WHERE id=_id AND user_id=u; RETURN; END IF;
  IF NOT public.kitchen_valid_diner(_data->'document') OR jsonb_typeof(_data->'shared') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'meals_invalid'; END IF;
  g:=(_data->>'householdId')::uuid;
  IF (g IS NOT NULL AND NOT public.kitchen_household_member(g)) OR ((_data->>'shared')::boolean AND g IS NULL) THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
  IF p.id IS NULL THEN
   IF (SELECT count(*) FROM public.kitchen_diners WHERE user_id=u)>=24 THEN RAISE EXCEPTION 'meals_limit'; END IF;
   INSERT INTO public.kitchen_diners(id,user_id,household_id,shared,document) VALUES(_id,u,g,(_data->>'shared')::boolean,_data->'document');
  ELSE UPDATE public.kitchen_diners SET household_id=g,shared=(_data->>'shared')::boolean,document=_data->'document',revision=revision+1,updated_at=now() WHERE id=_id; END IF;
 ELSE RAISE EXCEPTION 'meals_invalid'; END IF;
END $$;

CREATE FUNCTION public.kitchen_invite_create(_id uuid,_household_id uuid,_revision integer,_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.kitchen_households; i public.kitchen_household_invites;
BEGIN
 IF NOT public.meals_access() THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.kitchen_households WHERE id=_household_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.kitchen_household_invites WHERE id=_id;
 IF FOUND THEN
  IF i.user_id=auth.uid() AND i.household_id=_household_id AND i.token_hash=_hash THEN RETURN; END IF;
  RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409';
 END IF;
 IF h.revision<>_revision THEN RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409'; END IF;
 IF _id IS NULL OR _hash IS NULL OR _hash!~'^[a-f0-9]{64}$' OR (SELECT count(*) FROM public.kitchen_household_invites WHERE household_id=h.id AND expires_at>now() AND used_at IS NULL AND revoked_at IS NULL)>=12 THEN RAISE EXCEPTION 'meals_limit'; END IF;
 INSERT INTO public.kitchen_household_invites(id,household_id,user_id,token_hash) VALUES(_id,h.id,auth.uid(),_hash);
END $$;
CREATE FUNCTION public.kitchen_invite_revoke(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.meals_access() THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 UPDATE public.kitchen_household_invites SET revoked_at=COALESCE(revoked_at,now()) WHERE id=_id AND user_id=auth.uid();
END $$;
CREATE FUNCTION public.kitchen_invite_accept(_hash text,_display_name text,_adult_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); i public.kitchen_household_invites; h public.kitchen_households; q jsonb;
BEGIN
 IF NOT public.meals_access() THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,2504));
 SELECT to_jsonb(x) INTO q FROM public.consume_ai_quota(u,'meals:invite',10,300) x;
 -- Return invalid attempts, rather than raising and rolling back the quota increment.
 IF NOT COALESCE((q->>'allowed')::boolean,false) THEN RETURN '{"status":"rate_limited"}'::jsonb; END IF;
 IF _hash IS NULL OR _hash!~'^[a-f0-9]{64}$' OR _adult_confirmed IS DISTINCT FROM true OR _display_name IS NULL OR length(btrim(_display_name)) NOT BETWEEN 1 AND 60 THEN RETURN '{"status":"invalid"}'::jsonb; END IF;
 SELECT * INTO i FROM public.kitchen_household_invites WHERE token_hash=_hash;
 IF NOT FOUND THEN RETURN '{"status":"invalid"}'::jsonb; END IF;
 SELECT * INTO h FROM public.kitchen_households WHERE id=i.household_id FOR UPDATE;
 SELECT * INTO i FROM public.kitchen_household_invites WHERE token_hash=_hash FOR UPDATE;
 IF h.id IS NULL OR i.id IS NULL OR NOT public.meals_user_active(h.user_id) OR i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RETURN '{"status":"invalid"}'::jsonb; END IF;
 IF i.used_at IS NOT NULL THEN
  IF i.used_by=u AND EXISTS(SELECT 1 FROM public.kitchen_household_members WHERE household_id=h.id AND user_id=u) THEN RETURN jsonb_build_object('status','joined','householdId',h.id); END IF;
  RETURN '{"status":"invalid"}'::jsonb;
 END IF;
 IF (SELECT count(*) FROM public.kitchen_household_members WHERE household_id=h.id)>=12 OR (SELECT count(*) FROM public.kitchen_household_members WHERE user_id=u)>=5 THEN RETURN '{"status":"limit"}'::jsonb; END IF;
 INSERT INTO public.kitchen_household_members(household_id,user_id,display_name,adult_confirmed_at) VALUES(h.id,u,btrim(_display_name),now()) ON CONFLICT(household_id,user_id) DO NOTHING;
 UPDATE public.kitchen_household_invites SET used_at=now(),used_by=u WHERE id=i.id;
 UPDATE public.kitchen_households SET revision=revision+1 WHERE id=h.id;
 RETURN jsonb_build_object('status','joined','householdId',h.id);
END $$;

CREATE FUNCTION public.kitchen_meal_save(_id uuid,_revision integer,_input jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); m public.meal_wine_links; s public.cooking_sessions; w uuid; food integer; wr integer; pr integer; n text;
BEGIN
 IF NOT public.meals_access() THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _revision IS NULL OR _revision<0 THEN RAISE EXCEPTION 'meals_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,2504));
 SELECT * INTO m FROM public.meal_wine_links WHERE id=_id AND user_id=u FOR UPDATE;
 IF _input IS NULL THEN
  IF m.id IS NULL OR m.revision<>_revision THEN RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409'; END IF;
  DELETE FROM public.meal_wine_links WHERE id=_id AND user_id=u; RETURN;
 END IF;
 IF jsonb_typeof(_input)<>'object' OR NOT (_input ?& ARRAY['sessionId','wineId','wineRating','pairingRating','note']) OR (SELECT count(*) FROM jsonb_object_keys(_input))<>5 THEN RAISE EXCEPTION 'meals_invalid'; END IF;
 SELECT * INTO s FROM public.cooking_sessions WHERE id=(_input->>'sessionId')::uuid AND user_id=u FOR UPDATE;
 SELECT id INTO w FROM public.wines WHERE id=(_input->>'wineId')::uuid AND user_id=u;
 IF s.id IS NULL OR s.state->>'status'<>'completed' OR w IS NULL THEN RAISE EXCEPTION 'meals_denied' USING ERRCODE='42501'; END IF;
 wr:=(_input->>'wineRating')::integer; pr:=(_input->>'pairingRating')::integer; n:=_input->>'note';
 IF wr NOT BETWEEN 1 AND 5 OR pr NOT BETWEEN 1 AND 5 OR n IS NULL OR length(n)>500 OR n ~* '(allerg|anafyl|anaphyl|diabet|insulin|celiak|coeliac|celiac|gravid|pregnan|diagnos|medicin|medical|njursjuk|kidney disease|eating.disorder|atstorn|ätstör)' THEN RAISE EXCEPTION 'meals_invalid'; END IF;
 SELECT rating INTO food FROM public.cooking_feedback WHERE session_id=s.id AND user_id=u;
 IF m.id IS NOT NULL AND m.session_id=s.id AND m.wine_id=w AND m.wine_rating IS NOT DISTINCT FROM wr AND m.pairing_rating IS NOT DISTINCT FROM pr AND m.note=n THEN RETURN; END IF;
 IF (m.id IS NULL AND _revision<>0) OR (m.id IS NOT NULL AND (m.revision<>_revision OR m.session_id<>s.id)) THEN RAISE EXCEPTION 'meals_conflict' USING ERRCODE='PT409'; END IF;
 IF m.id IS NULL THEN INSERT INTO public.meal_wine_links(id,user_id,session_id,wine_id,food_rating,wine_rating,pairing_rating,note) VALUES(_id,u,s.id,w,food,wr,pr,n);
 ELSE UPDATE public.meal_wine_links SET wine_id=w,food_rating=food,wine_rating=wr,pairing_rating=pr,note=n,revision=revision+1,updated_at=now() WHERE id=_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reset_privacy_memory(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.reset_wine_privacy_memory(_user_id);
 PERFORM public.reset_food_memory(_user_id);
 UPDATE public.kitchen_diners SET document=jsonb_set(document,'{preferences}','[]'::jsonb),revision=revision+1,updated_at=now() WHERE user_id=_user_id;
END $$;
CREATE FUNCTION public.run_meals_retention(_execute boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF _execute THEN
  WITH gone AS (DELETE FROM public.kitchen_household_invites WHERE id IN (SELECT id FROM public.kitchen_household_invites WHERE expires_at<now()-interval '7 days' ORDER BY expires_at LIMIT 1000) RETURNING id) SELECT count(*) INTO n FROM gone;
 ELSE SELECT count(*) INTO n FROM (SELECT 1 FROM public.kitchen_household_invites WHERE expires_at<now()-interval '7 days' LIMIT 1000) x; END IF;
 RETURN jsonb_build_object('invites',n,'moreWork',EXISTS(SELECT 1 FROM public.kitchen_household_invites WHERE expires_at<now()-interval '7 days'));
END $$;
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname IN
 ('kitchen_valid_diner','kitchen_household_member','kitchen_household_owner','kitchen_diner_visible','kitchen_family_change','kitchen_invite_create','kitchen_invite_revoke','kitchen_invite_accept','kitchen_meal_save','run_meals_retention') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  IF split_part(fn::text,'(',1) NOT IN ('kitchen_valid_diner','run_meals_retention') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
