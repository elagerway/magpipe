-- Proactive WhatsApp health check — every 30 minutes.
--
-- Calls the whatsapp-health-check edge function, which validates each active
-- number's access token + Cloud API registration status, auto-re-registers
-- dropped numbers using their stored PIN, and pages via SMS on token death /
-- failed re-registration. Guardrail for the 2026-05-29 incident where a number
-- silently went deregistered (133010) with no detection.
--
-- Uses Vault for credentials (same pattern as knowledge-crawl-process etc.) —
-- the service-role bearer passes verify_jwt, so the function deploys normally.

select cron.unschedule('whatsapp-health-check')
where exists (select 1 from cron.job where jobname = 'whatsapp-health-check');

select cron.schedule(
  'whatsapp-health-check',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/whatsapp-health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
