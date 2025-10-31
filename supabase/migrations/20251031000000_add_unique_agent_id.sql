-- Add unique agent_id column to agent_configs
-- This replaces the Retell-specific retell_agent_id with our own UUID-based identifier

ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS agent_id UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL;

-- Create index for agent_id lookups
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_id ON agent_configs(agent_id);

-- Backfill agent_id for existing records (will generate new UUIDs)
UPDATE agent_configs
SET agent_id = gen_random_uuid()
WHERE agent_id IS NULL;

-- Add comment
COMMENT ON COLUMN agent_configs.agent_id IS 'Unique identifier for the agent configuration (platform-agnostic)';
