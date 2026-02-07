-- Add end_call configuration to agent_configs
-- Allows per-agent control of how/when the agent can end calls

ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS end_call_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS end_call_description TEXT DEFAULT 'End the phone call. Use this when the conversation is complete, the caller says goodbye, or there''s nothing more to discuss.';

-- Add comment for documentation
COMMENT ON COLUMN agent_configs.end_call_enabled IS 'Whether the agent can end calls automatically';
COMMENT ON COLUMN agent_configs.end_call_description IS 'Custom description for when the agent should end the call (shown to LLM)';
