-- Add config_id to transfer_numbers to link transfer numbers to specific agents
-- Migration: 20260130000003_transfer_numbers_agent_fk.sql

-- Add config_id column to link transfer numbers to specific agent configs
ALTER TABLE transfer_numbers
ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE;

-- Create index for agent config lookups
CREATE INDEX IF NOT EXISTS idx_transfer_numbers_config ON transfer_numbers(config_id);

-- Add comment
COMMENT ON COLUMN transfer_numbers.config_id IS 'The agent configuration this transfer number belongs to';
