-- Add Slack notification columns to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS slack_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_channel TEXT,
  ADD COLUMN IF NOT EXISTS slack_inbound_calls BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_all_calls BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_inbound_messages BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_all_messages BOOLEAN DEFAULT false;
