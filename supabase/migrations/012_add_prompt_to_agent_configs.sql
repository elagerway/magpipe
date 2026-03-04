-- Add prompt, retell_agent_id, and agent_name columns to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS retell_agent_id TEXT,
ADD COLUMN IF NOT EXISTS agent_name TEXT,
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en-US';

-- Add comments
COMMENT ON COLUMN agent_configs.prompt IS 'System prompt for the AI agent behavior';
COMMENT ON COLUMN agent_configs.retell_agent_id IS 'Retell.ai agent ID';
COMMENT ON COLUMN agent_configs.agent_name IS 'Display name for the agent';
COMMENT ON COLUMN agent_configs.language IS 'Language code for the agent (e.g., en-US)';