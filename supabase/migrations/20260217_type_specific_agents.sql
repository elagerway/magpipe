-- Migration: Type-Specific Agent Architecture
-- Adds new agent types (inbound_voice, outbound_voice, text, email, chat_widget)
-- Consolidates to single system_prompt, adds shared memory column

-- 1. Drop old CHECK constraint
ALTER TABLE agent_configs DROP CONSTRAINT IF EXISTS agent_configs_agent_type_check;

-- 2. Migrate existing data
UPDATE agent_configs SET agent_type = 'inbound_voice' WHERE agent_type = 'inbound';
UPDATE agent_configs SET agent_type = 'outbound_voice' WHERE agent_type = 'outbound';
UPDATE agent_configs SET agent_type = 'inbound_voice' WHERE agent_type = 'both';

-- 3. For outbound agents, copy outbound prompt into system_prompt if system_prompt is empty
UPDATE agent_configs
SET system_prompt = outbound_system_prompt
WHERE agent_type = 'outbound_voice'
  AND outbound_system_prompt IS NOT NULL
  AND outbound_system_prompt != ''
  AND (system_prompt IS NULL OR system_prompt = '');

-- 4. New CHECK constraint with 5 types
ALTER TABLE agent_configs
ADD CONSTRAINT agent_configs_agent_type_check
CHECK (agent_type IN ('inbound_voice', 'outbound_voice', 'text', 'email', 'chat_widget'));

-- 5. Add shared memory column
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS shared_memory_agent_ids UUID[] DEFAULT '{}';

-- 6. Deprecate outbound_system_prompt (keep column for safety, stop using)
COMMENT ON COLUMN agent_configs.outbound_system_prompt IS 'DEPRECATED - use system_prompt for all types';
