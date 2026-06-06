-- Change default LLM model from gpt-4.1 to gpt-4.1-mini
-- gpt-4.1-mini is the recommended model (better latency, 3x cheaper than gpt-4.1)
ALTER TABLE agent_configs ALTER COLUMN llm_model SET DEFAULT 'gpt-4.1-mini';
