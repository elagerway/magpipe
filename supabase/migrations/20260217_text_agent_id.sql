-- Add text_agent_id column for independent SMS/text routing
-- Allows a phone number to have a separate agent for SMS vs voice calls

ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS text_agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN service_numbers.text_agent_id IS 'Agent that handles SMS/text for this number (NULL = falls back to agent_id)';
