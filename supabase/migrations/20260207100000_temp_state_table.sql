-- Temporary state storage for multi-step operations like warm transfers
-- States are auto-expired to prevent stale data

CREATE TABLE IF NOT EXISTS temp_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_temp_state_expires_at ON temp_state(expires_at);

-- Disable RLS for simplicity (internal use only via service role)
ALTER TABLE temp_state DISABLE ROW LEVEL SECURITY;

-- Clean up expired entries periodically (will be called by cron or manually)
CREATE OR REPLACE FUNCTION cleanup_expired_temp_state()
RETURNS void AS $$
BEGIN
  DELETE FROM temp_state WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE temp_state IS 'Temporary key-value storage for multi-step operations like warm transfers';
