-- Migration 056: Add Voice AI Stack Support
-- Enables switching between Retell and LiveKit providers

-- Create enum for voice AI stacks
CREATE TYPE voice_ai_stack AS ENUM ('retell', 'livekit');

-- Add voice AI stack columns to agent_configs
ALTER TABLE agent_configs
  ADD COLUMN active_voice_stack voice_ai_stack DEFAULT 'retell',
  ADD COLUMN livekit_room_id TEXT,
  ADD COLUMN stack_config JSONB DEFAULT '{}'::jsonb;

-- Create index for filtering by stack
CREATE INDEX idx_agent_configs_voice_stack ON agent_configs(active_voice_stack);

-- Add comments for documentation
COMMENT ON COLUMN agent_configs.active_voice_stack IS 'Active Voice AI provider (retell or livekit)';
COMMENT ON COLUMN agent_configs.livekit_room_id IS 'LiveKit room ID (only used when stack is livekit)';
COMMENT ON COLUMN agent_configs.stack_config IS 'Stack-specific configuration (JSON)';

-- Set all existing configs to use Retell (current provider)
UPDATE agent_configs SET active_voice_stack = 'retell' WHERE active_voice_stack IS NULL;
