-- Add LLM parameters to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 1),
ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 150 CHECK (max_tokens >= 50 AND max_tokens <= 500),
ADD COLUMN IF NOT EXISTS vetting_strategy TEXT DEFAULT 'name-and-purpose' CHECK (vetting_strategy IN ('name-and-purpose', 'strict', 'lenient')),
ADD COLUMN IF NOT EXISTS transfer_unknown_callers BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN agent_configs.temperature IS 'LLM temperature parameter (0-1) for response creativity';
COMMENT ON COLUMN agent_configs.max_tokens IS 'Maximum tokens for LLM response generation';
COMMENT ON COLUMN agent_configs.vetting_strategy IS 'How strictly to vet unknown callers';
COMMENT ON COLUMN agent_configs.transfer_unknown_callers IS 'Whether to automatically transfer unknown callers';