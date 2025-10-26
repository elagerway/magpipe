-- Add call recording preference to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS record_calls BOOLEAN DEFAULT true;

COMMENT ON COLUMN users.record_calls IS 'Whether to record phone calls for this user';
