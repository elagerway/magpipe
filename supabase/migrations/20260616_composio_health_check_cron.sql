-- Composio support-email pipeline watchdog cron (applied live 2026-06-16).
--
-- Replaces the check_scheduled_staleness alarm dropped on 2026-05-13 when the
-- Gmail polling cron was retired in favor of the Composio push trigger. That
-- left the push pipeline with NO staleness monitor — which is how a revoked
-- Composio API key (2026-04-27) silently stopped support-ticket ingestion for
-- ~7 weeks before anyone noticed.
--
-- This cron calls the composio-health-check edge function every 30 minutes.
-- That function reportError()s (→ SMS/email alert fan-out) if any of:
--   * the Composio API key is invalid (list call 401s),
--   * there is no ACTIVE Gmail connected account,
--   * no enabled GMAIL_NEW_GMAIL_MESSAGE trigger is bound to an ACTIVE account.
-- It deliberately checks connection/trigger health, NOT inbound email volume,
-- to avoid false-paging on a legitimately quiet inbox.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  PERFORM cron.unschedule('composio-health-check');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule(
  'composio-health-check',
  '*/30 * * * *',
  $CRON$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/composio-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
