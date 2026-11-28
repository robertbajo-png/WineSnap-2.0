-- Diner ids are private meal metadata, not part of the shopping quantity basis.
CREATE FUNCTION public.kitchen_week_diner_ids_valid(ids jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN false ELSE
  jsonb_array_length(ids) BETWEEN 1 AND 24 AND (
   SELECT count(*)=count(DISTINCT value) AND coalesce(bool_and(
    jsonb_typeof(value)='string' AND (value#>>'{}') ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   ),false) FROM jsonb_array_elements(ids)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.kitchen_week_diner_ids_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.kitchen_week_meal_valid(m jsonb, week_start date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(m) IS DISTINCT FROM 'object' THEN false ELSE COALESCE(
  m ?& ARRAY['date','meal','recipeVersionId','servings'] AND
  m - ARRAY['date','meal','recipeVersionId','servings','dinerIds'] = '{}'::jsonb AND
  jsonb_typeof(m->'date')='string' AND EXISTS (
   SELECT 1 FROM generate_series(0,6) AS day_no(n)
   WHERE m->>'date'=to_char((week_start+n)::timestamp,'YYYY-MM-DD')
  ) AND m->>'meal' IN ('breakfast','lunch','dinner','snack') AND
  jsonb_typeof(m->'recipeVersionId')='string' AND
  m->>'recipeVersionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
  jsonb_typeof(m->'servings')='number' AND
  m->>'servings' ~ '^([1-9]|1[0-9]|2[0-4])$' AND
  (NOT (m ? 'dinerIds') OR public.kitchen_week_diner_ids_valid(m->'dinerIds')),false) END;
$$;

CREATE FUNCTION public.kitchen_week_validate_diner_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior jsonb:='[]'; addition record;
BEGIN
 IF NOT public.kitchen_week_document_valid(NEW.document,NEW.week_start)
  THEN RAISE EXCEPTION 'week_plan_invalid' USING ERRCODE='22023'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(NEW.document->'shoppingEdits') e
  CROSS JOIN LATERAL jsonb_array_elements(e.value->'basis'->'sources') s
  WHERE s.value ? 'dinerIds'
 ) THEN RAISE EXCEPTION 'week_plan_invalid' USING ERRCODE='22023'; END IF;
 IF TG_OP='UPDATE' THEN prior:=OLD.document->'meals'; END IF;
 -- Existing references to a removed profile never reveal data or block unrelated edits.
 FOR addition IN
  SELECT m->>'date',m->>'meal',d::uuid AS diner_id FROM jsonb_array_elements(NEW.document->'meals') m
   CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(m->'dinerIds','[]')) d
  EXCEPT
  SELECT m->>'date',m->>'meal',d::uuid FROM jsonb_array_elements(prior) m
   CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(m->'dinerIds','[]')) d
 LOOP
  IF NOT public.meals_user_active(NEW.user_id)
    THEN RAISE EXCEPTION 'week_plan_diner_unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.kitchen_diners
   WHERE id=addition.diner_id AND user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'week_plan_diner_unavailable' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_week_validate_diner_changes() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER kitchen_week_validate_diners_before_write
 BEFORE INSERT OR UPDATE OF document ON public.kitchen_week_plans
 FOR EACH ROW EXECUTE FUNCTION public.kitchen_week_validate_diner_changes();
