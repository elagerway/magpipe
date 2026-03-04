-- Add is_global flag to agent_configs for the system-wide Magpipe platform agent
-- Only one agent can be marked as global (enforced by unique partial index)

ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- Add greeting column for agent greeting message
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS greeting TEXT;

-- Ensure only one global agent exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_global
ON agent_configs (is_global) WHERE is_global = true;

COMMENT ON COLUMN agent_configs.is_global IS 'If true, this is the global Magpipe platform agent configured by admins';
COMMENT ON COLUMN agent_configs.greeting IS 'Initial greeting message from the agent';
