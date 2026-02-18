-- Add webhook_url and webhook_secret to api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Webhook delivery log for debugging
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_api_key ON webhook_deliveries(api_key_id);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'webhook_deliveries'
    AND policyname = 'Users can view own webhook deliveries'
  ) THEN
    CREATE POLICY "Users can view own webhook deliveries"
      ON webhook_deliveries FOR SELECT
      USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));
  END IF;
END $$;
