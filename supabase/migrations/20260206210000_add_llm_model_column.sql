-- Add LLM model column to agent_configs
-- Allows users to choose which LLM model their agent uses

ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS llm_model TEXT DEFAULT 'gpt-4.1-nano';

COMMENT ON COLUMN agent_configs.llm_model IS 'The LLM model used by the agent (e.g., gpt-4.1-nano, gpt-4o, claude-3-5-sonnet)';
