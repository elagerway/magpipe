-- Backfill retell_llm_id for existing agent
UPDATE agent_configs
SET retell_llm_id = 'llm_4295d8a43509e3e58649b6053a24'
WHERE retell_agent_id = 'agent_0b0a4f05ac249ebe0df4c3f7b9'
AND retell_llm_id IS NULL;
