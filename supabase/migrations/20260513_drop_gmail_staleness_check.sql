-- 20260513_drop_gmail_staleness_check.sql
--
-- The poll-gmail-tickets / poll-gmail-inbox crons were retired on 2026-04-27
-- (commit 22753a5: "feat: Composio Gmail trigger pipeline — replace cron
-- polling with push") in favor of push-based Composio triggers. Both cron
-- entries in cron.job were flipped to active=false but the staleness
-- watchdog from 20260310_error_monitoring.sql kept reading
-- support_email_config.last_polled_at — which the dead crons used to
-- update — and firing `scheduled_function_stale` alerts every 30 minutes.
--
-- The check is unsalvageable for the new pipeline because:
--   1. Composio's push trigger is event-driven — no fixed heartbeat to
--      compare against.
--   2. A real staleness signal for the new pipeline would have to track
--      composio-trigger-webhook receipt counts, not Gmail poll times.
--
-- Per Erik 2026-05-13: kill the cron-era check outright. A new monitor
-- for the push pipeline can be added separately once we know what shape
-- it should take (probably "no GMAIL_NEW_GMAIL_MESSAGE received in N
-- hours despite an active integration" — needs its own design).

-- Unschedule the watchdog cron. cron.unschedule returns boolean — if the
-- job was never scheduled (e.g. fresh DB), wrap to make this idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-scheduled-staleness') THEN
    PERFORM cron.unschedule('check-scheduled-staleness');
  END IF;
END $$;

-- Drop the function itself so future readers don't wire it back up
-- expecting it to do something useful.
DROP FUNCTION IF EXISTS public.check_scheduled_staleness();
