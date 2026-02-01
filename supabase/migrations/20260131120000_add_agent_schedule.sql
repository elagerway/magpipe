-- Add schedule columns to agent_configs table
-- Allows setting separate schedules for calls and texts

ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS calls_schedule JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS texts_schedule JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'America/Los_Angeles';

-- Add comment to explain the schedule format
COMMENT ON COLUMN agent_configs.calls_schedule IS 'Schedule for when agent handles calls. JSON format: {"monday": {"enabled": true, "start": "09:00", "end": "17:00"}, ...}. NULL means always available.';
COMMENT ON COLUMN agent_configs.texts_schedule IS 'Schedule for when agent handles texts. JSON format: {"monday": {"enabled": true, "start": "09:00", "end": "17:00"}, ...}. NULL means always available.';
COMMENT ON COLUMN agent_configs.schedule_timezone IS 'IANA timezone for schedule (e.g., America/Los_Angeles)';
