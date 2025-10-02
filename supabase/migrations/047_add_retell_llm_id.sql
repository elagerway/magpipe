-- Add retell_llm_id to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS retell_llm_id TEXT;

COMMENT ON COLUMN agent_configs.retell_llm_id IS 'Retell.ai LLM ID associated with this agent';
