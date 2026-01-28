-- Migration: Scheduled Actions
-- Enables scheduling SMS messages and other actions for future execution

-- Create scheduled_actions table
CREATE TABLE IF NOT EXISTS scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('send_sms', 'call_contact')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Action parameters (flexible JSON for different action types)
  -- For SMS: { recipient_phone, recipient_name, message, sender_number }
  parameters JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Source tracking
  conversation_id UUID REFERENCES admin_conversations(id) ON DELETE SET NULL,
  created_via TEXT DEFAULT 'agent' CHECK (created_via IN ('agent', 'api', 'ui'))
);

-- Index for finding due actions efficiently
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_due
  ON scheduled_actions (scheduled_at)
  WHERE status = 'pending';

-- Index for user's scheduled actions
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_user
  ON scheduled_actions (user_id, status);

-- Enable RLS
ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own scheduled actions" ON scheduled_actions;
CREATE POLICY "Users can view own scheduled actions"
  ON scheduled_actions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own scheduled actions" ON scheduled_actions;
CREATE POLICY "Users can insert own scheduled actions"
  ON scheduled_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can cancel own pending scheduled actions" ON scheduled_actions;
CREATE POLICY "Users can cancel own pending scheduled actions"
  ON scheduled_actions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Service role can do everything (for cron job execution)
DROP POLICY IF EXISTS "Service role full access" ON scheduled_actions;
CREATE POLICY "Service role full access"
  ON scheduled_actions FOR ALL
  USING (auth.role() = 'service_role');

-- Function to process scheduled actions (called by cron)
CREATE OR REPLACE FUNCTION process_scheduled_actions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  -- Call the Edge Function using http extension
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/process-scheduled-actions',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer your-supabase-service-role-key')
    ],
    'application/json',
    '{}'
  )::http_request);

  RAISE NOTICE 'Scheduled actions cron executed with status: %', response.status;
END;
$$;

-- Schedule cron job to run every 5 minutes
SELECT cron.schedule(
  'process-scheduled-actions',
  '*/5 * * * *',
  $$SELECT process_scheduled_actions();$$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_scheduled_actions() TO service_role;

COMMENT ON FUNCTION process_scheduled_actions() IS 'Calls the process-scheduled-actions Edge Function to execute due scheduled actions. Runs every 5 minutes via pg_cron.';

COMMENT ON TABLE scheduled_actions IS 'Stores scheduled actions like SMS reminders for future execution by the cron job.';
