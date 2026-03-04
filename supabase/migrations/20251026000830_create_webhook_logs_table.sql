-- Create webhook_logs table for debugging webhook payloads
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at
  ON public.webhook_logs(received_at DESC);

-- Add index for webhook type
CREATE INDEX IF NOT EXISTS idx_webhook_logs_type
  ON public.webhook_logs(webhook_type);

-- Add comment
COMMENT ON TABLE public.webhook_logs IS 'Temporary table for debugging webhook payloads';
