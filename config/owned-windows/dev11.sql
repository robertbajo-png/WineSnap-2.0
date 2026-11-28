-- Owned-only, separately delivered. Never part of the ordinary migration ledger.
BEGIN;
CREATE ROLE winesnap_dev11_api NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE winesnap_dev11_api SET log_statement = 'none';
ALTER ROLE winesnap_dev11_api SET log_duration = off;
ALTER ROLE winesnap_dev11_api SET log_min_duration_statement = -1;
ALTER ROLE winesnap_dev11_api SET log_min_error_statement = 'panic';
ALTER ROLE winesnap_dev11_api SET log_min_messages = 'panic';
ALTER ROLE winesnap_dev11_api SET log_parameter_max_length = 0;
ALTER ROLE winesnap_dev11_api SET log_parameter_max_length_on_error = 0;
CREATE SCHEMA winesnap_dev11_control;
CREATE SCHEMA winesnap_dev11_data;
REVOKE ALL ON SCHEMA winesnap_dev11_control, winesnap_dev11_data
  FROM PUBLIC, anon, authenticated, authenticator, service_role;
SET LOCAL search_path = '';

CREATE TABLE winesnap_dev11_control.installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  identity uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE TABLE winesnap_dev11_control.account (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_stamp uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_revision uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_consent_at timestamptz,
  goal_notice smallint CHECK (goal_notice IS NOT DISTINCT FROM 1 OR goal_notice IS NULL),
  goal_saved boolean NOT NULL DEFAULT false CHECK (NOT goal_saved OR goal_consent_at IS NOT NULL),
  readings_revision uuid NOT NULL DEFAULT gen_random_uuid(),
  readings_consent_at timestamptz,
  readings_notice smallint CHECK (readings_notice IS NOT DISTINCT FROM 1 OR readings_notice IS NULL),
  CHECK ((goal_notice IS NULL) = (goal_consent_at IS NULL)),
  CHECK ((readings_notice IS NULL) = (readings_consent_at IS NULL))
);
-- A restore borrows live permits; neither grants nor permits are archived.
CREATE TABLE winesnap_dev11_control.reading_permit (
  owner uuid NOT NULL REFERENCES winesnap_dev11_control.account(owner) ON DELETE CASCADE,
  id uuid NOT NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner,id)
);
CREATE INDEX ON winesnap_dev11_control.reading_permit (expires_at);
CREATE TABLE winesnap_dev11_data.goal (
  owner uuid PRIMARY KEY REFERENCES winesnap_dev11_control.account(owner) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('meal','day')),
  grams text NOT NULL CHECK (grams ~ '^(0|[1-9][0-9]{0,3})([.][0-9]{1,3})?$' AND grams::numeric > 0)
);
CREATE FUNCTION winesnap_dev11_control.valid_reading(_reading jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_typeof(_reading) = 'object'
    AND jsonb_typeof(_reading->'value') = 'string'
    AND jsonb_typeof(_reading->'at') = 'string'
    AND _reading->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$'
    AND right(_reading->>'at',6) <> '-00:00'
    AND CASE _reading->>'method'
      WHEN 'blood' THEN _reading->>'unit' = 'mmol/L'
        AND _reading->>'value' ~ '^(0|[1-9][0-9]{0,5})([.][0-9]{1,3})?$'
        AND _reading - ARRAY['method','unit','value','at'] = '{}'::jsonb
      WHEN 'breath' THEN _reading->>'unit' = 'ppm'
        AND _reading->>'value' ~ '^(0|[1-9][0-9]{0,5})([.][0-9]{1,3})?$'
        AND _reading - ARRAY['method','unit','value','at'] = '{}'::jsonb
      WHEN 'urine' THEN _reading->>'unit' = 'category' AND _reading->>'scale' = 'ketostix-acetoacetate'
        AND _reading->>'value' IN ('negative','trace','small','moderate','large')
        AND _reading - ARRAY['method','unit','value','at','scale'] = '{}'::jsonb
      ELSE false END, false);
$$;
CREATE TABLE winesnap_dev11_data.reading (
  owner uuid NOT NULL,
  id uuid NOT NULL,
  measured_at timestamptz NOT NULL,
  reading jsonb NOT NULL CHECK (
    winesnap_dev11_control.valid_reading(reading) AND (reading->>'at')::timestamptz = measured_at
  ),
  PRIMARY KEY (owner,id),
  FOREIGN KEY (owner,id) REFERENCES winesnap_dev11_control.reading_permit(owner,id) ON DELETE CASCADE
);
ALTER TABLE winesnap_dev11_control.installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE winesnap_dev11_control.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE winesnap_dev11_control.reading_permit ENABLE ROW LEVEL SECURITY;
ALTER TABLE winesnap_dev11_data.goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE winesnap_dev11_data.reading ENABLE ROW LEVEL SECURITY;

-- Keep ordinary erasure valid after a restore that intentionally omits DEV-11.
CREATE FUNCTION winesnap_local.dev11_account_erasure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('winesnap_dev11_control.account') IS NOT NULL THEN
    EXECUTE 'DELETE FROM winesnap_dev11_control.account WHERE owner = $1' USING NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION winesnap_local.dev11_account_erasure()
  FROM PUBLIC, anon, authenticated, authenticator, service_role;
CREATE TRIGGER dev11_account_erasure AFTER INSERT ON public.privacy_erasure_receipts
FOR EACH ROW EXECUTE FUNCTION winesnap_local.dev11_account_erasure();

CREATE FUNCTION winesnap_dev11_control.summary(_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'goalChoice', jsonb_build_object('enabled', a.goal_consent_at IS NOT NULL, 'revision', a.goal_revision),
    'readingsChoice', jsonb_build_object('enabled', a.readings_consent_at IS NOT NULL, 'revision', a.readings_revision),
    'goal', CASE WHEN a.goal_consent_at IS NOT NULL AND a.goal_saved THEN
      (SELECT jsonb_build_object('period', g.period, 'grams', g.grams)
        FROM winesnap_dev11_data.goal g WHERE g.owner = _owner) END,
    'readings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'revision', p.revision, 'reading', r.reading)
        ORDER BY r.measured_at DESC, r.id)
      FROM winesnap_dev11_data.reading r JOIN winesnap_dev11_control.reading_permit p USING (owner,id)
      WHERE r.owner = _owner AND a.readings_consent_at IS NOT NULL AND p.expires_at > statement_timestamp()
    ), '[]'::jsonb)
  ) FROM winesnap_dev11_control.account a WHERE a.owner = _owner;
$$;

CREATE FUNCTION winesnap_dev11_control.command(_owner uuid, _input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a winesnap_dev11_control.account;
  action text := _input->>'action';
  feature text;
  old_revision text;
  allowed_at timestamptz;
  measured timestamptz;
  expiry timestamptz;
  item_id uuid;
  p winesnap_dev11_control.reading_permit;
  instant timestamptz;
BEGIN
  SELECT * INTO a FROM winesnap_dev11_control.account WHERE owner = _owner FOR UPDATE;
  IF NOT FOUND OR NOT public.privacy_account_active(_owner)
    OR NOT EXISTS (SELECT 1 FROM winesnap_dev11_control.installation) THEN
    RETURN '{"status":403}';
  END IF;
  instant := clock_timestamp();
  DELETE FROM winesnap_dev11_control.reading_permit WHERE owner = _owner AND expires_at <= instant;

  IF action IN ('read','export') THEN
    IF action = 'export' AND (
      _input->>'goalRevision' IS DISTINCT FROM a.goal_revision::text OR
      _input->>'readingsRevision' IS DISTINCT FROM a.readings_revision::text
    ) THEN RETURN '{"status":409}'; END IF;
  ELSIF action IN ('enable','disable','setGoal','deleteGoal','addReading','editReading','deleteReading') THEN
    feature := CASE WHEN action IN ('enable','disable') THEN _input->>'feature'
      WHEN action IN ('setGoal','deleteGoal') THEN 'goal' ELSE 'readings' END;
    IF feature = 'goal' THEN
      old_revision := a.goal_revision::text;
      allowed_at := a.goal_consent_at;
    ELSIF feature = 'readings' THEN
      old_revision := a.readings_revision::text;
      allowed_at := a.readings_consent_at;
    ELSE RETURN '{"status":400}'; END IF;
    IF _input->>'revision' IS DISTINCT FROM old_revision THEN RETURN '{"status":409}'; END IF;

    IF action = 'enable' THEN
      IF _input->'notice' IS DISTINCT FROM '1'::jsonb OR allowed_at IS NOT NULL THEN
        RETURN '{"status":409}';
      END IF;
    ELSIF allowed_at IS NULL THEN
      RETURN '{"status":409}';
    END IF;

    IF action IN ('enable','disable') THEN
      IF feature = 'goal' THEN
        DELETE FROM winesnap_dev11_data.goal WHERE owner = _owner;
        UPDATE winesnap_dev11_control.account
          SET goal_consent_at = CASE WHEN action = 'enable' THEN instant END,
            goal_notice = CASE WHEN action = 'enable' THEN 1 END,
            goal_revision = gen_random_uuid(), goal_saved = false
          WHERE owner = _owner;
      ELSE
        DELETE FROM winesnap_dev11_control.reading_permit WHERE owner = _owner;
        UPDATE winesnap_dev11_control.account
          SET readings_consent_at = CASE WHEN action = 'enable' THEN instant END,
            readings_notice = CASE WHEN action = 'enable' THEN 1 END,
            readings_revision = gen_random_uuid()
          WHERE owner = _owner;
      END IF;
    ELSIF action IN ('setGoal','deleteGoal') THEN
      IF action = 'setGoal' THEN
        INSERT INTO winesnap_dev11_data.goal(owner,period,grams)
          VALUES (_owner,_input#>>'{goal,period}',_input#>>'{goal,grams}')
          ON CONFLICT (owner) DO UPDATE SET period = excluded.period, grams = excluded.grams;
      ELSE
        DELETE FROM winesnap_dev11_data.goal WHERE owner = _owner;
      END IF;
      UPDATE winesnap_dev11_control.account
        SET goal_revision = gen_random_uuid(), goal_saved = (action = 'setGoal') WHERE owner = _owner;
    ELSE
      IF action <> 'deleteReading' THEN
        IF NOT winesnap_dev11_control.valid_reading(_input->'reading') THEN RETURN '{"status":400}'; END IF;
        measured := (_input#>>'{reading,at}')::timestamptz;
        expiry := measured + interval '2160 hours';
        IF measured > instant OR expiry <= instant THEN RETURN '{"status":400}'; END IF;
      END IF;
      IF action = 'addReading' THEN
        IF (SELECT count(*) FROM winesnap_dev11_control.reading_permit WHERE owner = _owner) >= 600 THEN
          RETURN '{"status":429}';
        END IF;
        item_id := gen_random_uuid();
        INSERT INTO winesnap_dev11_control.reading_permit(owner,id,expires_at) VALUES (_owner,item_id,expiry);
        INSERT INTO winesnap_dev11_data.reading VALUES (_owner,item_id,measured,_input->'reading');
      ELSE
        item_id := (_input->>'id')::uuid;
        SELECT * INTO p FROM winesnap_dev11_control.reading_permit
          WHERE owner = _owner AND id = item_id FOR UPDATE;
        IF NOT FOUND OR p.revision::text IS DISTINCT FROM _input->>'entryRevision' THEN
          RETURN '{"status":409}';
        END IF;
        IF action = 'deleteReading' THEN
          DELETE FROM winesnap_dev11_control.reading_permit WHERE owner = _owner AND id = item_id;
        ELSE
          UPDATE winesnap_dev11_data.reading SET measured_at = measured, reading = _input->'reading'
            WHERE owner = _owner AND id = item_id;
          IF NOT FOUND THEN RETURN '{"status":409}'; END IF;
          UPDATE winesnap_dev11_control.reading_permit
            SET revision = gen_random_uuid(), expires_at = least(expiry,expires_at)
            WHERE owner = _owner AND id = item_id;
        END IF;
      END IF;
    END IF;
    UPDATE winesnap_dev11_control.account SET state_stamp = gen_random_uuid()
      WHERE owner = _owner RETURNING * INTO a;
  ELSE RETURN '{"status":400}'; END IF;

  RETURN jsonb_build_object(
    'status',200,'stamp',a.state_stamp,'state',winesnap_dev11_control.summary(_owner),
    'expiresAt',(SELECT min(expires_at) FROM winesnap_dev11_control.reading_permit
      WHERE owner = _owner AND expires_at > instant)
  );
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation
  OR datetime_field_overflow OR invalid_datetime_format OR invalid_parameter_value THEN
  RETURN '{"status":400}';
END $$;

CREATE FUNCTION winesnap_dev11_control.confirm(_owner uuid, _stamp uuid, _expires timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed uuid;
BEGIN
  SELECT state_stamp INTO observed FROM winesnap_dev11_control.account WHERE owner = _owner FOR UPDATE;
  RETURN FOUND AND observed = _stamp AND public.privacy_account_active(_owner)
    AND EXISTS (SELECT 1 FROM winesnap_dev11_control.installation)
    AND (_expires IS NULL OR clock_timestamp() < _expires);
END $$;

-- These are operator-only primitives. Capture must go directly into a short-lived
-- encrypted local archive; the API role cannot call them.
CREATE FUNCTION winesnap_dev11_control.capture(_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE snapshot jsonb;
DECLARE origin uuid;
BEGIN
  snapshot := winesnap_dev11_control.command(_owner,'{"action":"read"}');
  IF (snapshot->>'status') <> '200' THEN RETURN NULL; END IF;
  SELECT identity INTO STRICT origin FROM winesnap_dev11_control.installation;
  RETURN jsonb_build_object(
    'version',1,'installation',origin,'owner',_owner,'capturedAt',clock_timestamp(),
    'state',snapshot->'state'
  );
END $$;

CREATE FUNCTION winesnap_dev11_control.restore(_owner uuid, _archive jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  a winesnap_dev11_control.account;
  origin uuid;
  captured timestamptz;
  instant timestamptz;
  incoming jsonb := _archive->'state';
  item jsonb;
  reading jsonb;
  found_goal integer := 0;
  found_readings integer := 0;
  added integer;
BEGIN
  SELECT * INTO a FROM winesnap_dev11_control.account WHERE owner = _owner FOR UPDATE;
  IF NOT FOUND OR NOT public.privacy_account_active(_owner) THEN RETURN '{"status":403}'; END IF;
  SELECT identity INTO origin FROM winesnap_dev11_control.installation;
  IF NOT FOUND OR _archive->>'installation' IS DISTINCT FROM origin::text
    OR _archive->>'owner' IS DISTINCT FROM _owner::text OR _archive->'version' IS DISTINCT FROM '1'::jsonb
  THEN RETURN '{"status":403}'; END IF;
  instant := clock_timestamp();
  captured := (_archive->>'capturedAt')::timestamptz;
  IF captured IS NULL OR captured <= instant - interval '168 hours' OR captured > instant
    OR jsonb_typeof(incoming->'readings') IS DISTINCT FROM 'array'
    OR jsonb_array_length(incoming->'readings') > 600 THEN RETURN '{"status":400}'; END IF;

  IF a.goal_consent_at IS NOT NULL AND a.goal_saved AND captured >= a.goal_consent_at
    AND incoming#>>'{goalChoice,revision}' = a.goal_revision::text
    AND jsonb_typeof(incoming->'goal') = 'object' THEN
    INSERT INTO winesnap_dev11_data.goal(owner,period,grams)
      VALUES (_owner,incoming#>>'{goal,period}',incoming#>>'{goal,grams}')
      ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS found_goal = ROW_COUNT;
  END IF;
  IF a.readings_consent_at IS NOT NULL AND captured >= a.readings_consent_at
    AND incoming#>>'{readingsChoice,revision}' = a.readings_revision::text THEN
    FOR item IN SELECT value FROM jsonb_array_elements(incoming->'readings') LOOP
      reading := item->'reading';
      IF NOT winesnap_dev11_control.valid_reading(reading) THEN RAISE check_violation; END IF;
      INSERT INTO winesnap_dev11_data.reading(owner,id,measured_at,reading)
        SELECT _owner,p.id,(reading->>'at')::timestamptz,reading
        FROM winesnap_dev11_control.reading_permit p
        WHERE p.owner = _owner AND p.id = (item->>'id')::uuid AND p.revision::text = item->>'revision'
          AND p.expires_at > instant AND (reading->>'at')::timestamptz <= captured
          AND p.expires_at <= (reading->>'at')::timestamptz + interval '2160 hours'
        ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      found_readings := found_readings + added;
    END LOOP;
  END IF;
  IF found_goal + found_readings > 0 THEN
    UPDATE winesnap_dev11_control.account SET state_stamp = gen_random_uuid() WHERE owner = _owner;
  END IF;
  RETURN jsonb_build_object('status',200,'goals',found_goal,'readings',found_readings);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation
  OR datetime_field_overflow OR invalid_datetime_format OR invalid_parameter_value THEN
  RETURN '{"status":400}';
END $$;

CREATE FUNCTION winesnap_dev11_control.prune()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM winesnap_dev11_control.reading_permit WHERE expires_at <= clock_timestamp();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA winesnap_dev11_control,winesnap_dev11_data
  FROM PUBLIC, anon, authenticated, authenticator, service_role, winesnap_dev11_api;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA winesnap_dev11_control
  FROM PUBLIC, anon, authenticated, authenticator, service_role;
GRANT USAGE ON SCHEMA winesnap_dev11_control TO winesnap_dev11_api;
GRANT EXECUTE ON FUNCTION winesnap_dev11_control.command(uuid,jsonb),
  winesnap_dev11_control.confirm(uuid,uuid,timestamptz) TO winesnap_dev11_api;
COMMIT;
