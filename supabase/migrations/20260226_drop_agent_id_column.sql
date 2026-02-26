-- Drop the redundant agent_id column from agent_configs.
-- Every FK in the system references the PK "id", not "agent_id".
-- The column only caused confusion (UI showed agent_id instead of id).

DROP INDEX IF EXISTS idx_agent_configs_agent_id;
ALTER TABLE agent_configs DROP COLUMN IF EXISTS agent_id;
