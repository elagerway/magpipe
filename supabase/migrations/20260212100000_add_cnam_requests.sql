-- CNAM (Caller ID Name) request tracking table
-- Used to automate branded caller ID registration with SignalWire via email

CREATE TABLE IF NOT EXISTS cnam_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_number_id UUID NOT NULL REFERENCES service_numbers(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL CHECK (char_length(requested_name) <= 15),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'processing', 'confirmed', 'rejected')),
  email_thread JSONB DEFAULT '[]'::jsonb,
  postmark_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add cnam_name to service_numbers for confirmed CNAM
ALTER TABLE service_numbers ADD COLUMN IF NOT EXISTS cnam_name TEXT;

-- Index for looking up requests by service number
CREATE INDEX IF NOT EXISTS idx_cnam_requests_service_number ON cnam_requests(service_number_id);
CREATE INDEX IF NOT EXISTS idx_cnam_requests_user ON cnam_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cnam_requests_status ON cnam_requests(status);

-- RLS policies
ALTER TABLE cnam_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own CNAM requests"
  ON cnam_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own CNAM requests"
  ON cnam_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role can update (edge functions handle status changes)
CREATE POLICY "Service role can update CNAM requests"
  ON cnam_requests FOR UPDATE
  USING (true);
