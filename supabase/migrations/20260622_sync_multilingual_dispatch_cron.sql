-- Multilingual dispatch reconciler cron (#96).
--
-- Calls the sync-multilingual-dispatch edge function every 10 minutes. That
-- function reconciles LiveKit inbound-trunk membership from the DB so agents
-- whose language ∈ {multi,fr,es,de} ride the ML trunk (→ Service B worker
-- "SW Telephony Agent ML") and everyone else stays on the main trunk
-- (→ Service A "SW Telephony Agent"). DB is the source of truth; the function
-- is idempotent (no-op when membership already matches) and pins the ML anchor
-- number so the trunk is never left empty.
--
-- Posts an empty body '{}' → APPLY mode (not dry_run). Service-role bearer from
-- vault so verify_jwt passes (the function is not public).
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  PERFORM cron.unschedule('sync-multilingual-dispatch');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule(
  'sync-multilingual-dispatch',
  '*/10 * * * *',
  $CRON$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/sync-multilingual-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
