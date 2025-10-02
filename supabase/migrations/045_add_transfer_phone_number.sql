-- Add transfer phone number to agent_configs
ALTER TABLE agent_configs
ADD COLUMN IF NOT EXISTS transfer_phone_number TEXT;
