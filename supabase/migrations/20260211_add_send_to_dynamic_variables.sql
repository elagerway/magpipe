-- Add send_to JSONB column to dynamic_variables for per-variable app destination control
-- Example: {"slack": true, "hubspot": false}
-- NULL means use the global extract_data.send_to setting from agent_configs.functions
ALTER TABLE dynamic_variables ADD COLUMN IF NOT EXISTS send_to JSONB;

COMMENT ON COLUMN dynamic_variables.send_to IS 'Per-variable app destination overrides. NULL = use global extract_data.send_to from agent config.';
