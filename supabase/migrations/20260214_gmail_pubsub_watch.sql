-- Add Gmail Pub/Sub watch tracking columns to agent_email_configs
ALTER TABLE agent_email_configs
  ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watch_resource_id TEXT;

COMMENT ON COLUMN agent_email_configs.watch_expiration IS 'When the Gmail Pub/Sub watch expires (must renew before this)';
COMMENT ON COLUMN agent_email_configs.watch_resource_id IS 'Resource ID returned by Gmail users.watch() API';
