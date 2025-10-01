-- Add advanced agent settings columns
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS agent_volume DECIMAL(3,1) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS ambient_sound TEXT,
ADD COLUMN IF NOT EXISTS ambient_sound_volume DECIMAL(3,1) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS noise_suppression TEXT DEFAULT 'medium';
