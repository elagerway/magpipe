-- Add custom_instructions JSONB column to agent_configs
-- This stores per-agent feature toggles like enable_sms, enable_transfer, enable_booking
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS custom_instructions JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN agent_configs.custom_instructions IS 'JSONB field for storing agent-specific settings like enable_sms, enable_transfer, enable_booking';
