-- Enable multi-agent support on agent_configs
-- Migration: 20260130000000_multi_agent_support.sql

-- Remove UNIQUE constraint on user_id to allow multiple agents per user
-- Note: The constraint name may vary, so we try common patterns
DO $$
BEGIN
    -- Try to drop the unique constraint (Supabase default naming)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_configs_user_id_key') THEN
        ALTER TABLE agent_configs DROP CONSTRAINT agent_configs_user_id_key;
    END IF;
END $$;

-- Add new columns for multi-agent support
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'My Agent';

ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'inbound' CHECK (agent_type IN ('inbound', 'outbound', 'both'));

ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Make name NOT NULL after adding default (for existing rows)
UPDATE agent_configs SET name = 'My Agent' WHERE name IS NULL;
ALTER TABLE agent_configs ALTER COLUMN name SET NOT NULL;

-- Unique constraint for one default agent per user (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_user_default
ON agent_configs(user_id) WHERE is_default = true;

-- Mark existing agents as default (only one per user at this point)
UPDATE agent_configs SET is_default = true WHERE is_default = false;

-- Add comment
COMMENT ON COLUMN agent_configs.name IS 'Display name for the agent';
COMMENT ON COLUMN agent_configs.agent_type IS 'Type of agent: inbound, outbound, or both';
COMMENT ON COLUMN agent_configs.is_default IS 'Whether this is the default agent for the user';
