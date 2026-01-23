-- Add outbound_system_prompt column to agent_configs
-- Allows users to configure a separate prompt for outbound calls

ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS outbound_system_prompt TEXT;

-- Add a comment explaining the column
COMMENT ON COLUMN agent_configs.outbound_system_prompt IS 'System prompt used for outbound calls. If NULL, a default outbound prompt will be used.';
