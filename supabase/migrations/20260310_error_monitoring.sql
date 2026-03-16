-- Centralized error monitoring expansion
-- Adds source/severity to system_error_logs, error alert prefs, and staleness detection cron

ALTER TABLE system_error_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'error';

CREATE INDEX IF NOT EXISTS idx_system_error_logs_source ON system_error_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity ON system_error_logs(severity);

ALTER TABLE admin_notification_config
  ADD COLUMN IF NOT EXISTS errors_sms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS errors_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS errors_slack boolean DEFAULT false;

-- Check scheduled function staleness every 30 minutes
CREATE OR REPLACE FUNCTION check_scheduled_staleness()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last_polled timestamptz;
  v_stale_threshold CONSTANT interval := interval '2 hours';
  v_dedup_window CONSTANT interval := interval '1 hour';
BEGIN
  SELECT last_polled_at INTO v_last_polled
  FROM support_email_config WHERE gmail_address IS NOT NULL LIMIT 1;

  IF v_last_polled IS NOT NULL AND (now() - v_last_polled) > v_stale_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM system_error_logs
      WHERE error_type = 'scheduled_function_stale'
        AND metadata->>'function_name' = 'poll-gmail-tickets'
        AND created_at > (now() - v_dedup_window)
    ) THEN
      INSERT INTO system_error_logs (error_type, error_message, source, severity, metadata)
      VALUES (
        'scheduled_function_stale',
        format('Gmail polling has not run in %s hours. Last run: %s',
          round(EXTRACT(EPOCH FROM (now() - v_last_polled)) / 3600, 1)::text,
          to_char(v_last_polled AT TIME ZONE 'UTC', 'Mon DD HH24:MI UTC')),
        'scheduled', 'warning',
        jsonb_build_object(
          'function_name', 'poll-gmail-tickets',
          'last_run_at', v_last_polled::text,
          'hours_stale', round(EXTRACT(EPOCH FROM (now() - v_last_polled)) / 3600, 1)
        )
      );
    END IF;
  END IF;
END;
$$;

SELECT cron.schedule('check-scheduled-staleness', '*/30 * * * *', 'SELECT check_scheduled_staleness()');
