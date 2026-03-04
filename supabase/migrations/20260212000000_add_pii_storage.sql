-- Add pii_storage column to agent_configs
-- Controls how PII is handled: 'enabled' (store as-is), 'disabled' (don't store), 'redacted' (redact before storing)
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS pii_storage TEXT DEFAULT 'enabled'
CHECK (pii_storage IN ('enabled', 'disabled', 'redacted'));
