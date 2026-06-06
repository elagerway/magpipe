-- 2026-05-06 — Critical-service error SMS alerts (admin notifications)
--
-- Triggered by the OpenAI quota incident this morning: agents went silent for
-- ~36h before anyone noticed because errors only landed in system_error_logs
-- and Erik wasn't checking the dashboard. This migration:
--   1. Adds error_alerts as a dedup ledger so log-error can throttle SMS to
--      one message per error_type per 15-min window (otherwise an outage =
--      hundreds of SMS in minutes).
--   2. Flips admin_notification_config.errors_sms on with sms_phone set to
--      Erik's number so alerts route somewhere by default.
--
-- Aggregation logic lives in log-error/index.ts: when sending an alert, it
-- counts how many failures of this error_type have hit system_error_logs in
-- the same 15-min window and which sources are impacted, then composes an SMS
-- like "OpenAI down: 12 failures across SMS, voice, WhatsApp".

CREATE TABLE IF NOT EXISTS error_alerts (
  id uuid primary key default gen_random_uuid(),
  error_type text not null,
  count_in_window int not null,
  services_impacted text[] not null default '{}',
  sample_message text,
  sample_error_code text,
  recipient_phone text,
  channel text not null default 'sms',  -- sms / email / slack
  sent_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_error_alerts_type_sent
  ON error_alerts(error_type, sent_at desc);

COMMENT ON TABLE error_alerts IS
  'Dedup ledger for admin error alerts. log-error inserts a row each time it
   fires a critical-error SMS/email/Slack alert and consults this table to
   throttle subsequent alerts of the same error_type to one per 15 min.';

-- Enable SMS alerts for the singleton admin notification config row.
-- The row id is the documented sentinel constant referenced by log-error
-- and admin-notifications-api (see CONFIG_ID = 00000000-0000-0000-0000-000000000100).
INSERT INTO admin_notification_config (id, sms_phone, errors_sms)
VALUES ('00000000-0000-0000-0000-000000000100', '+15555550100', true)
ON CONFLICT (id) DO UPDATE
SET sms_phone = EXCLUDED.sms_phone,
    errors_sms = true,
    updated_at = now();
