-- Widen max_tokens constraint from 50-500 to 50-4096
-- Needed for agents using tool calling (e.g. custom functions) where
-- 150-500 tokens isn't enough to summarize tool results.
-- Already applied to production DB on 2026-02-24.

ALTER TABLE agent_configs DROP CONSTRAINT agent_configs_max_tokens_check;
ALTER TABLE agent_configs ADD CONSTRAINT agent_configs_max_tokens_check CHECK (max_tokens >= 50 AND max_tokens <= 4096);
