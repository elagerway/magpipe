-- Status log for 90-day uptime history bars
CREATE TABLE status_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  status text NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  latency integer,
  detail text
);

-- Index for fast date-range + category queries
CREATE INDEX idx_status_log_checked_category ON status_log (checked_at, category);

-- Enable RLS (public-status uses service role key, so no user policies needed)
ALTER TABLE status_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (implicit), no user access needed
-- The edge function uses service_role key to insert

-- RPC function: returns daily aggregates per category for the last 90 days
CREATE OR REPLACE FUNCTION get_status_history(viewer_tz text DEFAULT 'UTC')
RETURNS TABLE (
  day date,
  category text,
  total_checks bigint,
  operational_checks bigint,
  degraded_checks bigint,
  down_checks bigint,
  uptime_pct numeric,
  worst_detail text
) LANGUAGE sql STABLE AS $$
  SELECT
    (checked_at AT TIME ZONE viewer_tz)::date AS day,
    category,
    count(*) AS total_checks,
    count(*) FILTER (WHERE status = 'operational') AS operational_checks,
    count(*) FILTER (WHERE status = 'degraded') AS degraded_checks,
    count(*) FILTER (WHERE status = 'down') AS down_checks,
    ROUND(
      count(*) FILTER (WHERE status IN ('operational', 'degraded')) * 100.0 / NULLIF(count(*), 0),
      2
    ) AS uptime_pct,
    (array_agg(detail ORDER BY
      CASE status WHEN 'down' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END,
      checked_at DESC
    ) FILTER (WHERE detail IS NOT NULL AND status != 'operational'))[1] AS worst_detail
  FROM status_log
  WHERE checked_at > now() - interval '90 days'
  GROUP BY day, category
  ORDER BY day, category
$$;

-- Cron: ping public-status every 5 minutes to ensure continuous logging
-- Requires pg_net extension (already enabled on Supabase)
SELECT cron.schedule(
  'status-check-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_get(
    url := 'https://api.magpipe.ai/functions/v1/public-status',
    headers := '{}'::jsonb
  );$$
);

-- Cron: clean up logs older than 90 days (daily at 3am UTC)
SELECT cron.schedule(
  'status-log-cleanup',
  '0 3 * * *',
  $$DELETE FROM status_log WHERE checked_at < now() - interval '90 days';$$
);
