-- Add voice cloning columns to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS cloned_voice_id TEXT,
ADD COLUMN IF NOT EXISTS cloned_voice_name TEXT;
