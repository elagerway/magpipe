-- Add agent_id to service_numbers table
-- Migration: 20260130000001_service_numbers_agent_id.sql

-- Add agent_id column to link phone numbers to specific agents
ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;

-- Create index for agent lookups
CREATE INDEX IF NOT EXISTS idx_service_numbers_agent_id ON service_numbers(agent_id);

-- Add comment
COMMENT ON COLUMN service_numbers.agent_id IS 'The agent configuration that handles calls/SMS for this number (NULL = uses user default agent)';
