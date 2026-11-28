-- Activation preparation only: separate from the ledger and the dormant DEV-11 installer.
BEGIN;
SET LOCAL search_path = '';
CREATE TABLE winesnap_dev11_control.maintenance (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  installation uuid NOT NULL,
  attempt uuid,
  started_at timestamptz,
  checked_at timestamptz,
  CHECK ((attempt IS NULL) = (started_at IS NULL)),
  CHECK (attempt IS NULL OR checked_at IS NULL)
);
ALTER TABLE winesnap_dev11_control.maintenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winesnap_dev11_control.maintenance
  FROM PUBLIC, anon, authenticated, authenticator, service_role, winesnap_dev11_api;

CREATE FUNCTION winesnap_dev11_control.maintenance_begin(_installation uuid)
RETURNS uuid LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO winesnap_dev11_control.maintenance AS m (installation,attempt,started_at)
    SELECT identity,gen_random_uuid(),clock_timestamp()
    FROM winesnap_dev11_control.installation WHERE identity = _installation
  ON CONFLICT (singleton) DO UPDATE SET
    attempt = excluded.attempt, started_at = excluded.started_at, checked_at = NULL
    WHERE m.installation = excluded.installation
      AND (m.attempt IS NULL OR m.started_at <= clock_timestamp() - interval '5 minutes')
  RETURNING attempt;
$$;

CREATE FUNCTION winesnap_dev11_control.maintenance_pass(_installation uuid, _attempt uuid)
RETURNS boolean LANGUAGE sql SET search_path = '' AS $$
  WITH verified AS (
    UPDATE winesnap_dev11_control.maintenance m
      SET checked_at = clock_timestamp(), attempt = NULL, started_at = NULL
      WHERE m.installation = _installation AND m.attempt = _attempt
        AND m.started_at <= clock_timestamp()
        AND m.started_at > clock_timestamp() - interval '5 minutes'
        AND EXISTS (SELECT 1 FROM winesnap_dev11_control.installation WHERE identity = _installation)
      RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM verified);
$$;

CREATE FUNCTION winesnap_dev11_control.maintenance_deadline()
RETURNS timestamptz LANGUAGE sql SET search_path = '' AS $$
  SELECT m.checked_at + interval '75 minutes'
  FROM winesnap_dev11_control.maintenance m
  JOIN winesnap_dev11_control.installation i ON i.identity = m.installation
  WHERE m.attempt IS NULL AND m.checked_at <= clock_timestamp()
    AND m.checked_at > clock_timestamp() - interval '75 minutes'
  FOR SHARE OF m;
$$;

REVOKE EXECUTE ON FUNCTION winesnap_dev11_control.command(uuid,jsonb),
  winesnap_dev11_control.confirm(uuid,uuid,timestamptz) FROM winesnap_dev11_api;

CREATE FUNCTION winesnap_dev11_control.guarded_command(_owner uuid, _input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deadline timestamptz := winesnap_dev11_control.maintenance_deadline();
DECLARE reply jsonb;
BEGIN
  IF deadline IS NULL AND coalesce(_input->>'action','') NOT IN ('read','disable','deleteGoal','deleteReading') THEN
    RETURN '{"status":403}';
  END IF;
  reply := winesnap_dev11_control.command(_owner,_input);
  IF (reply->>'status') <> '200' THEN RETURN reply; END IF;
  IF deadline IS NULL THEN
    -- Rights actions still work. No goal, reading, measurement time or entry ID leaves this path.
    RETURN reply || jsonb_build_object('maintenancePaused',true,'expiresAt',NULL,
      'state',(reply->'state') || '{"goal":null,"readings":[]}'::jsonb);
  END IF;
  RETURN reply || jsonb_build_object('expiresAt',least(deadline,(reply->>'expiresAt')::timestamptz));
END $$;

CREATE FUNCTION winesnap_dev11_control.guarded_confirm(_owner uuid, _stamp uuid, _expires timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Content-bearing responses always carry a deadline; null is the redacted rights path.
  IF _expires IS NOT NULL AND winesnap_dev11_control.maintenance_deadline() IS NULL THEN RETURN false; END IF;
  RETURN winesnap_dev11_control.confirm(_owner,_stamp,_expires);
END $$;

REVOKE ALL ON FUNCTION winesnap_dev11_control.maintenance_begin(uuid),
  winesnap_dev11_control.maintenance_pass(uuid,uuid), winesnap_dev11_control.maintenance_deadline(),
  winesnap_dev11_control.guarded_command(uuid,jsonb), winesnap_dev11_control.guarded_confirm(uuid,uuid,timestamptz)
  FROM PUBLIC, anon, authenticated, authenticator, service_role;
GRANT EXECUTE ON FUNCTION winesnap_dev11_control.guarded_command(uuid,jsonb),
  winesnap_dev11_control.guarded_confirm(uuid,uuid,timestamptz) TO winesnap_dev11_api;
COMMIT;
