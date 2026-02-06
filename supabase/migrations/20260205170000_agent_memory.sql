-- Migration: Agent Memory Feature
-- Enables agents to remember past conversations with callers

-- Add memory_enabled toggle to agent_configs
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN DEFAULT false;

-- Add memory config options
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS memory_config JSONB DEFAULT '{
  "max_history_calls": 5,
  "include_summaries": true,
  "include_key_topics": true,
  "include_preferences": true
}'::jsonb;

-- Add agent_id to conversation_contexts for per-agent memory
-- First drop the unique constraint on contact_id since we now have (contact_id, agent_id) uniqueness
ALTER TABLE conversation_contexts DROP CONSTRAINT IF EXISTS conversation_contexts_contact_id_key;

-- Add agent_id column (nullable to support existing records that are user-wide)
ALTER TABLE conversation_contexts ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE;

-- Add call_id reference to track which calls contributed to memory
ALTER TABLE conversation_contexts ADD COLUMN IF NOT EXISTS last_call_ids UUID[] DEFAULT '{}';

-- Make summary column nullable for initial creation (will be populated after first call)
ALTER TABLE conversation_contexts ALTER COLUMN summary DROP NOT NULL;
ALTER TABLE conversation_contexts DROP CONSTRAINT IF EXISTS conversation_contexts_summary_check;

-- Create unique constraint for (contact_id, agent_id) - allows one memory per contact per agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_contexts_contact_agent_unique
ON conversation_contexts(contact_id, agent_id) WHERE agent_id IS NOT NULL;

-- Keep unique constraint for contact_id where agent_id is NULL (legacy/user-wide memory)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_contexts_contact_only_unique
ON conversation_contexts(contact_id) WHERE agent_id IS NULL;

-- Ensure we have indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_contacts_phone_user ON contacts(phone_number, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_contact_agent ON conversation_contexts(contact_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_agent ON conversation_contexts(agent_id);

-- Comments
COMMENT ON COLUMN agent_configs.memory_enabled IS 'Whether the agent remembers past conversations with callers';
COMMENT ON COLUMN agent_configs.memory_config IS 'Configuration for memory feature (max_history_calls, include_summaries, etc.)';
COMMENT ON COLUMN conversation_contexts.agent_id IS 'Agent that owns this memory context (null for user-wide memory)';
COMMENT ON COLUMN conversation_contexts.last_call_ids IS 'Array of recent call IDs that contributed to this memory';
