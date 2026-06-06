-- Status page subscribers: email, SMS, and webhook notifications
CREATE TABLE status_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,                          -- E.164 format
  webhook_url text,
  channels text[] NOT NULL DEFAULT '{email}',
  confirmed boolean NOT NULL DEFAULT false,
  confirm_token uuid DEFAULT gen_random_uuid(),
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

-- Unique constraints (partial — only where non-null)
CREATE UNIQUE INDEX idx_status_subscribers_email ON status_subscribers (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_status_subscribers_phone ON status_subscribers (phone) WHERE phone IS NOT NULL;

-- No RLS needed — edge functions use service role key
ALTER TABLE status_subscribers ENABLE ROW LEVEL SECURITY;

-- State cache: stores last known status per category to detect transitions
CREATE TABLE status_state_cache (
  category text PRIMARY KEY,
  status text NOT NULL,
  detail text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE status_state_cache ENABLE ROW LEVEL SECURITY;

-- Update the existing cron to also trigger status-notify after public-status
SELECT cron.unschedule('status-check-every-5min');
SELECT cron.schedule(
  'status-check-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://api.magpipe.ai/functions/v1/public-status',
    headers := '{}'::jsonb
  );
  SELECT net.http_get(
    url := 'https://api.magpipe.ai/functions/v1/status-notify',
    headers := '{}'::jsonb
  );
  $$
);
