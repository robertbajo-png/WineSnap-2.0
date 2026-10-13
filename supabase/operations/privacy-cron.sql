-- Run only after staging checks, Edge deployment and approved production rollout.
-- Create the two Vault secrets through a secure operator workflow, never in Git:
-- winesnap_privacy_url = the target project's HTTPS Supabase URL
-- winesnap_privacy_cron_secret = the same >=32-character PRIVACY_CRON_SECRET
DO $$
DECLARE endpoint text; token text;
BEGIN
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name = 'winesnap_privacy_url';
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'winesnap_privacy_cron_secret';
  IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+[.]supabase[.]co$'
    OR token IS NULL OR length(token) < 32 THEN
    RAISE EXCEPTION 'Configure privacy scheduler Vault secrets first';
  END IF;
END;
$$;
SELECT cron.schedule('winesnap-privacy-maintenance', '17 * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'winesnap_privacy_url') || '/functions/v1/privacy-maintenance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'winesnap_privacy_cron_secret')),
    body := '{"execute":true}'::jsonb,
    timeout_milliseconds := 90000
  );
$job$);
