-- Add Cal.com OAuth tokens to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS cal_com_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cal_com_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cal_com_token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cal_com_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cal_com_default_event_type_id INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN users.cal_com_access_token IS 'OAuth access token for Cal.com API';
COMMENT ON COLUMN users.cal_com_refresh_token IS 'OAuth refresh token for Cal.com API';
COMMENT ON COLUMN users.cal_com_token_expires_at IS 'Expiration timestamp for the access token';
COMMENT ON COLUMN users.cal_com_user_id IS 'Cal.com user ID';
COMMENT ON COLUMN users.cal_com_default_event_type_id IS 'Default event type ID for bookings';

-- Create oauth_states table for CSRF protection during OAuth flows
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  provider TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_provider ON oauth_states(user_id, provider);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own states (though typically accessed via service role)
DROP POLICY IF EXISTS "Users can view own oauth states" ON oauth_states;
CREATE POLICY "Users can view own oauth states" ON oauth_states
  FOR SELECT USING (auth.uid() = user_id);

-- Clean up expired states periodically (can be done via cron or on access)
-- This is handled in application code
