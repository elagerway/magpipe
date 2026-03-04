-- Add transfer secret to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS transfer_secret TEXT;
