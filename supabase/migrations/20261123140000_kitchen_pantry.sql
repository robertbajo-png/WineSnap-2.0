-- Owner-private stock and explicit, once-per-session consumption.
CREATE TABLE public.kitchen_pantry (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK (revision>0),
 items jsonb NOT NULL CHECK (
  CASE WHEN jsonb_typeof(items)='array' THEN jsonb_array_length(items)<=300 ELSE false END
  AND octet_length(items::text)<=163840
 ),
 last_request_id uuid NOT NULL,
 updated_at timestamptz NOT NULL
);

CREATE TABLE public.kitchen_pantry_consumption (
 session_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 pantry_revision integer NOT NULL CHECK (pantry_revision>1),
 request_id uuid NOT NULL,
 items jsonb NOT NULL CHECK (
  CASE WHEN jsonb_typeof(items)='array' THEN jsonb_array_length(items) BETWEEN 1 AND 80 ELSE false END
  AND octet_length(items::text)<=65536
 ),
 confirmed_at timestamptz NOT NULL,
 FOREIGN KEY (session_id,user_id) REFERENCES public.cooking_sessions(id,user_id) ON DELETE CASCADE,
 UNIQUE (user_id,request_id)
);

ALTER TABLE public.kitchen_pantry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_pantry_consumption ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_pantry,public.kitchen_pantry_consumption FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.kitchen_pantry,public.kitchen_pantry_consumption TO authenticated,service_role;
CREATE POLICY kitchen_pantry_owner_read ON public.kitchen_pantry FOR SELECT TO authenticated
 USING (user_id=auth.uid() AND public.kitchen_access());
CREATE POLICY kitchen_pantry_consumption_owner_read ON public.kitchen_pantry_consumption FOR SELECT TO authenticated
 USING (user_id=auth.uid() AND public.kitchen_access());

CREATE FUNCTION public.kitchen_save_pantry_item(
 _item_id uuid,_expected_revision integer,_request_id uuid,_item jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); saved public.kitchen_pantry; item jsonb; name text;
 quantity numeric; unit text; confirmed boolean; changed timestamptz; items_next jsonb;
BEGIN
 IF owner_id IS NULL OR NOT public.kitchen_access()
  THEN RAISE EXCEPTION 'pantry_denied' USING ERRCODE='42501'; END IF;
 IF _item_id IS NULL OR _request_id IS NULL OR _expected_revision IS NULL
  OR _expected_revision NOT BETWEEN 0 AND 2147483646
  THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 IF _item IS NOT NULL THEN
  IF jsonb_typeof(_item) IS DISTINCT FROM 'object' OR octet_length(_item::text)>4096
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_item))<>4
   OR jsonb_typeof(_item->'name') IS DISTINCT FROM 'string'
   OR jsonb_typeof(_item->'unit') IS DISTINCT FROM 'string'
   OR jsonb_typeof(_item->'confirmed') IS DISTINCT FROM 'boolean'
   OR coalesce(jsonb_typeof(_item->'amount'),'missing') NOT IN ('number','null')
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
  name:=btrim(_item->>'name');
  unit:=_item->>'unit';
  confirmed:=(_item->>'confirmed')::boolean;
  quantity:=(_item->>'amount')::numeric;
  IF length(name) NOT BETWEEN 1 AND 120 OR name ~ '[[:cntrl:]]'
   OR unit NOT IN ('g','kg','ml','dl','l','tsp','tbsp','pcs','pinch')
   OR (confirmed AND quantity IS NULL) OR (quantity IS NOT NULL AND quantity NOT BETWEEN 0 AND 1000000)
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO saved FROM public.kitchen_pantry WHERE user_id=owner_id FOR UPDATE;
 changed:=clock_timestamp();
 IF _item IS NOT NULL THEN
  item:=jsonb_build_object('id',_item_id,'name',name,'unit',unit,'amount',quantity,
   'confirmedAt',CASE WHEN confirmed THEN changed ELSE NULL END);
 END IF;
 IF NOT FOUND THEN
  IF _expected_revision<>0 OR item IS NULL
   THEN RAISE EXCEPTION 'pantry_conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.kitchen_pantry VALUES (owner_id,1,jsonb_build_array(item),_request_id,changed)
   ON CONFLICT (user_id) DO NOTHING RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'pantry_conflict' USING ERRCODE='PT409'; END IF;
  RETURN to_jsonb(saved);
 END IF;
 IF saved.revision<>_expected_revision OR saved.last_request_id=_request_id
  THEN RAISE EXCEPTION 'pantry_conflict' USING ERRCODE='PT409'; END IF;
 SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality),'[]'::jsonb) INTO items_next
  FROM jsonb_array_elements(saved.items) WITH ORDINALITY e WHERE e.value->>'id'<>_item_id::text;
 IF (item IS NULL AND jsonb_array_length(items_next)=jsonb_array_length(saved.items))
  OR (item IS NOT NULL AND jsonb_array_length(items_next)>=300)
  THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 IF item IS NOT NULL THEN items_next:=items_next||jsonb_build_array(item); END IF;
 UPDATE public.kitchen_pantry SET items=items_next, revision=saved.revision+1,
  last_request_id=_request_id,updated_at=changed WHERE user_id=owner_id RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION public.kitchen_confirm_pantry_consumption(
 _session_id uuid,_session_revision integer,_expected_revision integer,_request_id uuid,_used jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); saved public.kitchen_pantry; receipt public.kitchen_pantry_consumption;
 entry jsonb; in_stock jsonb; part jsonb; confirmed_items jsonb:='[]'; items_next jsonb;
 amount_used numeric; remaining numeric; changed timestamptz;
BEGIN
 IF owner_id IS NULL OR NOT public.kitchen_access()
  THEN RAISE EXCEPTION 'pantry_denied' USING ERRCODE='42501'; END IF;
 IF _session_id IS NULL OR _session_revision IS NULL OR _session_revision<1
  OR _expected_revision IS NULL OR _expected_revision NOT BETWEEN 1 AND 2147483646
  OR _request_id IS NULL OR jsonb_typeof(_used) IS DISTINCT FROM 'array' OR octet_length(_used::text)>16384
  THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(_used) NOT BETWEEN 1 AND 80
  OR (SELECT count(DISTINCT value->>'itemId') FROM jsonb_array_elements(_used))<>jsonb_array_length(_used)
  THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(_used) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(entry))<>2
   OR jsonb_typeof(entry->'itemId') IS DISTINCT FROM 'string'
   OR entry->>'itemId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   OR jsonb_typeof(entry->'amount') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
  IF (entry->>'amount')::numeric NOT BETWEEN 0.000000001 AND 1000000
   THEN RAISE EXCEPTION 'pantry_invalid' USING ERRCODE='22023'; END IF;
 END LOOP;
 PERFORM 1 FROM public.cooking_sessions
  WHERE id=_session_id AND user_id=owner_id AND revision=_session_revision
   AND state->>'status'='completed' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pantry_session_unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO saved FROM public.kitchen_pantry WHERE user_id=owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pantry_conflict' USING ERRCODE='PT409'; END IF;
 SELECT * INTO receipt FROM public.kitchen_pantry_consumption WHERE session_id=_session_id AND user_id=owner_id;
 IF FOUND THEN
  IF receipt.request_id=_request_id AND receipt.pantry_revision=_expected_revision+1 AND
   (SELECT jsonb_agg(jsonb_build_object('itemId',value->'itemId','amount',value->'amount') ORDER BY ordinality)
    FROM jsonb_array_elements(receipt.items) WITH ORDINALITY)=_used
   THEN RETURN jsonb_build_object('pantry',to_jsonb(saved),'receipt',to_jsonb(receipt)); END IF;
  RAISE EXCEPTION 'pantry_session_reviewed' USING ERRCODE='PT409';
 END IF;
 IF saved.revision<>_expected_revision OR saved.last_request_id=_request_id OR EXISTS (
  SELECT 1 FROM public.kitchen_pantry_consumption WHERE user_id=owner_id AND request_id=_request_id
 ) THEN RAISE EXCEPTION 'pantry_conflict' USING ERRCODE='PT409'; END IF;
 changed:=clock_timestamp();
 items_next:=saved.items;
 FOR entry IN SELECT value FROM jsonb_array_elements(_used) LOOP
  amount_used:=(entry->>'amount')::numeric;
  SELECT value INTO in_stock FROM jsonb_array_elements(items_next) WHERE value->>'id'=entry->>'itemId';
  IF NOT FOUND OR in_stock->>'amount' IS NULL OR in_stock->>'confirmedAt' IS NULL
   OR (in_stock->>'confirmedAt')::timestamptz NOT BETWEEN changed-interval '168 hours' AND changed
   OR (in_stock->>'amount')::numeric<amount_used
   THEN RAISE EXCEPTION 'pantry_stock_unavailable' USING ERRCODE='PT409'; END IF;
  remaining:=(in_stock->>'amount')::numeric-amount_used;
  part:=jsonb_set(in_stock,'{amount}',to_jsonb(remaining));
  SELECT jsonb_agg(CASE WHEN value->>'id'=entry->>'itemId' THEN part ELSE value END ORDER BY ordinality)
   INTO items_next FROM jsonb_array_elements(items_next) WITH ORDINALITY;
  confirmed_items:=confirmed_items||jsonb_build_array(jsonb_build_object(
   'itemId',entry->'itemId','amount',amount_used,'name',in_stock->'name','unit',in_stock->'unit'));
 END LOOP;
 UPDATE public.kitchen_pantry SET items=items_next,revision=saved.revision+1,
  last_request_id=_request_id,updated_at=changed WHERE user_id=owner_id RETURNING * INTO saved;
 INSERT INTO public.kitchen_pantry_consumption VALUES
  (_session_id,owner_id,saved.revision,_request_id,confirmed_items,changed) RETURNING * INTO receipt;
 RETURN jsonb_build_object('pantry',to_jsonb(saved),'receipt',to_jsonb(receipt));
END $$;

REVOKE ALL ON FUNCTION public.kitchen_save_pantry_item(uuid,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.kitchen_confirm_pantry_consumption(uuid,integer,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kitchen_save_pantry_item(uuid,integer,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_confirm_pantry_consumption(uuid,integer,integer,uuid,jsonb) TO authenticated;
