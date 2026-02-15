-- Migration: Review Requests
-- Automated review collection system for G2, Capterra, and Product Hunt
-- After users reach 25 calls, auto-email requesting platform reviews

-- Create review_requests table
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('g2', 'capterra', 'producthunt')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'clicked', 'completed', 'declined', 'failed')),
  call_count_at_send INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  postmark_message_id TEXT,
  error_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_review_requests_user_id ON review_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests (status);
CREATE INDEX IF NOT EXISTS idx_review_requests_platform ON review_requests (platform);

-- Enable RLS
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

-- RLS: Service role full access only (admin-only table)
DROP POLICY IF EXISTS "Service role full access" ON review_requests;
CREATE POLICY "Service role full access"
  ON review_requests FOR ALL
  USING (auth.role() = 'service_role');

-- Function to call the Edge Function via http extension (same pattern as process_scheduled_actions)
CREATE OR REPLACE FUNCTION process_review_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/process-review-requests',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer your-supabase-service-role-key')
    ],
    'application/json',
    '{}'
  )::http_request);

  RAISE NOTICE 'Review requests cron executed with status: %', response.status;
END;
$$;

-- Schedule cron job to run daily at 10:00 AM UTC
SELECT cron.schedule(
  'process-review-requests',
  '0 10 * * *',
  $$SELECT process_review_requests();$$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_review_requests() TO service_role;

COMMENT ON FUNCTION process_review_requests() IS 'Calls the process-review-requests Edge Function daily to send review request emails to eligible users.';
COMMENT ON TABLE review_requests IS 'Tracks automated review collection requests sent to users for G2, Capterra, and Product Hunt.';
