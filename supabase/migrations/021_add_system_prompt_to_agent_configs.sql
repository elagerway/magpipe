-- Add system_prompt and voice_id to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT 'You are Pat, a helpful AI assistant.',
ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT 'kate';

COMMENT ON COLUMN agent_configs.system_prompt IS 'System prompt that defines Pat''s personality and behavior';
COMMENT ON COLUMN agent_configs.voice_id IS 'Voice ID for text-to-speech (replaces voice column)';