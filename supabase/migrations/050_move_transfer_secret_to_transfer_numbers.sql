-- Move transfer_secret from agent_configs to transfer_numbers table
ALTER TABLE transfer_numbers
ADD COLUMN IF NOT EXISTS transfer_secret TEXT;

-- Remove transfer_secret from agent_configs (keep for backward compatibility but unused)
-- ALTER TABLE agent_configs DROP COLUMN IF EXISTS transfer_secret;
