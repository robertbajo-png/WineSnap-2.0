-- Private weekly documents. The same row revision protects planning and shopping edits.
CREATE FUNCTION public.kitchen_week_meal_valid(m jsonb, week_start date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(m) IS DISTINCT FROM 'object' THEN false ELSE COALESCE(
  m ?& ARRAY['date','meal','recipeVersionId','servings'] AND
  m - ARRAY['date','meal','recipeVersionId','servings'] = '{}'::jsonb AND
  jsonb_typeof(m->'date')='string' AND EXISTS (
   SELECT 1 FROM generate_series(0,6) AS day_no(n)
   WHERE m->>'date'=to_char((week_start+n)::timestamp,'YYYY-MM-DD')
  ) AND m->>'meal' IN ('breakfast','lunch','dinner','snack') AND
  jsonb_typeof(m->'recipeVersionId')='string' AND
  m->>'recipeVersionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
  jsonb_typeof(m->'servings')='number' AND
  m->>'servings' ~ '^([1-9]|1[0-9]|2[0-4])$',false) END;
$$;

CREATE FUNCTION public.kitchen_week_purchase_valid(item jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(item) IS DISTINCT FROM 'object' THEN false ELSE COALESCE(
  item ?& ARRAY['name','amount','unit'] AND
  item - ARRAY['name','amount','unit'] = '{}'::jsonb AND
  jsonb_typeof(item->'name')='string' AND length(btrim(item->>'name')) BETWEEN 1 AND 120 AND
  (item->'unit'='null'::jsonb OR item->>'unit' IN ('g','kg','ml','dl','l','tsp','tbsp','pcs','pinch')) AND
  CASE WHEN item->'amount'='null'::jsonb THEN true
   WHEN jsonb_typeof(item->'amount')='number' THEN
    item->>'unit' IS NOT NULL AND (item->>'amount')::numeric>0 AND
    (item->>'amount')::numeric<=5376000000000
   ELSE false END,false) END;
$$;

CREATE FUNCTION public.kitchen_week_document_valid(d jsonb, week_start date)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; source jsonb; basis jsonb;
BEGIN
 IF week_start IS NULL OR week_start NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-20' OR
    extract(isodow FROM week_start)<>1 OR jsonb_typeof(d) IS DISTINCT FROM 'object'
    THEN RETURN false; END IF;
 IF
    octet_length(d::text)>524288 OR NOT (d ?& ARRAY['weekStart','meals','manualItems','shoppingEdits']) OR
    d - ARRAY['weekStart','meals','manualItems','shoppingEdits'] <> '{}'::jsonb OR
    d->>'weekStart' IS DISTINCT FROM to_char(week_start::timestamp,'YYYY-MM-DD') OR
    jsonb_typeof(d->'meals')<>'array' OR jsonb_typeof(d->'manualItems')<>'array' OR
    jsonb_typeof(d->'shoppingEdits')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(d->'meals')>28 OR jsonb_array_length(d->'manualItems')>100 OR
    jsonb_array_length(d->'shoppingEdits')>2240 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'meals') LOOP
  IF NOT public.kitchen_week_meal_valid(item,week_start) THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'manualItems') LOOP
  IF jsonb_typeof(item)<>'object' THEN RETURN false; END IF;
  IF NOT (item ?& ARRAY['id','item','checked']) OR
     item - ARRAY['id','item','checked'] <> '{}'::jsonb OR jsonb_typeof(item->'id')<>'string' OR
     item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     jsonb_typeof(item->'checked')<>'boolean' OR
     NOT public.kitchen_week_purchase_valid(item->'item') THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'shoppingEdits') LOOP
  IF jsonb_typeof(item)<>'object' THEN RETURN false; END IF;
  IF NOT (item ?& ARRAY['key','basis','checked','excluded','adjustment']) OR
     item - ARRAY['key','basis','checked','excluded','adjustment'] <> '{}'::jsonb OR
     jsonb_typeof(item->'key')<>'string' OR length(item->>'key') NOT BETWEEN 1 AND 400 OR
     jsonb_typeof(item->'checked')<>'boolean' OR jsonb_typeof(item->'excluded')<>'boolean' OR
     (item->'adjustment'<>'null'::jsonb AND NOT public.kitchen_week_purchase_valid(item->'adjustment'))
     THEN RETURN false; END IF;
  basis:=item->'basis';
  IF jsonb_typeof(basis)<>'object' THEN RETURN false; END IF;
  IF NOT (basis ?& ARRAY['knownAmount','unknownAmounts','sources']) OR
     basis - ARRAY['knownAmount','unknownAmounts','sources'] <> '{}'::jsonb OR
     jsonb_typeof(basis->'unknownAmounts')<>'number' OR
     basis->>'unknownAmounts' !~ '^[0-9]{1,4}$' OR
     jsonb_typeof(basis->'sources')<>'array' THEN RETURN false; END IF;
  IF (basis->>'unknownAmounts')::numeric>2240 THEN RETURN false; END IF;
  IF basis->'knownAmount'<>'null'::jsonb THEN
   IF jsonb_typeof(basis->'knownAmount')<>'number' THEN RETURN false; END IF;
   IF (basis->>'knownAmount')::numeric<=0 OR (basis->>'knownAmount')::numeric>5376000000000
      THEN RETURN false; END IF;
  END IF;
  IF jsonb_array_length(basis->'sources') NOT BETWEEN 1 AND 28 THEN RETURN false; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(basis->'sources') LOOP
   IF NOT public.kitchen_week_meal_valid(source,week_start) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN (SELECT count(*)=count(DISTINCT (value->>'date',value->>'meal')) FROM jsonb_array_elements(d->'meals'))
    AND (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(d->'manualItems'))
    AND (SELECT count(*)=count(DISTINCT value->>'key') FROM jsonb_array_elements(d->'shoppingEdits'));
END $$;

REVOKE ALL ON FUNCTION public.kitchen_week_meal_valid(jsonb,date),
 public.kitchen_week_purchase_valid(jsonb),public.kitchen_week_document_valid(jsonb,date)
 FROM PUBLIC,anon,authenticated;

CREATE TABLE public.kitchen_week_plans (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 week_start date NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 document jsonb NOT NULL CHECK(public.kitchen_week_document_valid(document,week_start)),
 last_request_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,week_start)
);
ALTER TABLE public.kitchen_week_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_week_plans FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.kitchen_week_plans TO authenticated,service_role;
CREATE POLICY kitchen_week_plans_owner_read ON public.kitchen_week_plans FOR SELECT TO authenticated
 USING (user_id=auth.uid() AND public.kitchen_access());

CREATE FUNCTION public.kitchen_save_week_plan(
 _week_start date,_expected_revision integer,_request_id uuid,_document jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); saved public.kitchen_week_plans;
BEGIN
 IF NOT public.kitchen_access() THEN RAISE EXCEPTION 'week_plan_denied' USING ERRCODE='42501'; END IF;
 IF _expected_revision IS NULL OR _expected_revision NOT BETWEEN 0 AND 2147483646 OR
    _request_id IS NULL OR NOT public.kitchen_week_document_valid(_document,_week_start)
    THEN RAISE EXCEPTION 'week_plan_invalid' USING ERRCODE='22023'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(_document->'meals') AS planned(meal)
  WHERE NOT EXISTS (
   SELECT 1 FROM public.kitchen_recipe_versions v
   WHERE v.id=(planned.meal->>'recipeVersionId')::uuid AND v.user_id=owner_id
  )
 ) THEN RAISE EXCEPTION 'week_plan_recipe_unavailable' USING ERRCODE='42501'; END IF;

 -- The primary key arbitrates concurrent creates; the locked row arbitrates edits/retries.
 IF _expected_revision=0 THEN
  INSERT INTO public.kitchen_week_plans(user_id,week_start,revision,document,last_request_id)
   VALUES(owner_id,_week_start,1,_document,_request_id)
   ON CONFLICT(user_id,week_start) DO NOTHING RETURNING * INTO saved;
  IF FOUND THEN RETURN to_jsonb(saved); END IF;
 END IF;
 SELECT * INTO saved FROM public.kitchen_week_plans
  WHERE user_id=owner_id AND week_start=_week_start FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'week_plan_conflict' USING ERRCODE='PT409'; END IF;
 IF saved.last_request_id=_request_id THEN
  IF saved.revision<>_expected_revision+1 OR saved.document<>_document
    THEN RAISE EXCEPTION 'week_plan_invalid_retry' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(saved);
 END IF;
 IF saved.revision<>_expected_revision THEN RAISE EXCEPTION 'week_plan_conflict' USING ERRCODE='PT409'; END IF;
 UPDATE public.kitchen_week_plans SET document=_document,revision=revision+1,
  last_request_id=_request_id,updated_at=clock_timestamp()
  WHERE user_id=owner_id AND week_start=_week_start RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.kitchen_save_week_plan(date,integer,uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kitchen_save_week_plan(date,integer,uuid,jsonb) TO authenticated;
