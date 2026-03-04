-- Add after-hours forwarding number columns to agent_configs
ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS after_hours_call_forwarding TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS after_hours_sms_forwarding TEXT DEFAULT NULL;
