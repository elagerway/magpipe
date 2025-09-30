-- Add avatar_url and voice_id columns to agent_configs table
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT '11labs-Kate';

-- Add comment
COMMENT ON COLUMN agent_configs.avatar_url IS 'URL to the agent voice avatar image';
COMMENT ON COLUMN agent_configs.voice_id IS 'Retell.ai voice ID for the agent';