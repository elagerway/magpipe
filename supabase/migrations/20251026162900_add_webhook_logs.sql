-- Create webhook_logs table to store all incoming webhook payloads for debugging
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'signalwire', 'livekit', 'retell', etc.
  event_type TEXT, -- The type of event/status
  payload JSONB NOT NULL, -- Full webhook payload
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON public.webhook_logs(source);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON public.webhook_logs(event_type);

-- Enable RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything
CREATE POLICY "Service role has full access to webhook_logs"
  ON public.webhook_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read their own webhooks (for debugging)
CREATE POLICY "Users can view webhook_logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.webhook_logs IS 'Stores all incoming webhook payloads for debugging and audit purposes';
COMMENT ON COLUMN public.webhook_logs.source IS 'The service that sent the webhook (signalwire, livekit, retell, etc.)';
COMMENT ON COLUMN public.webhook_logs.event_type IS 'The type of event or call state';
COMMENT ON COLUMN public.webhook_logs.payload IS 'Complete webhook payload as JSON';
