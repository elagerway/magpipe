-- Per-agent notification preferences
-- Adds agent_id column so each agent can have its own notification settings

-- 1. Add agent_id column (nullable for backwards compatibility)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE;

-- 2. Drop old unique constraint on user_id alone
ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_key;

-- 3. Add new unique constraint on (user_id, agent_id)
ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_user_id_agent_id_key UNIQUE (user_id, agent_id);

-- 4. Add index for lookups
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_agent
  ON notification_preferences(user_id, agent_id);

-- 5. Duplicate existing rows for each agent the user owns
-- This ensures each agent inherits the user's current notification settings
INSERT INTO notification_preferences (
  user_id, agent_id,
  email_enabled, email_address,
  email_inbound_calls, email_all_calls, email_inbound_messages, email_all_messages,
  sms_enabled, sms_phone_number,
  sms_inbound_calls, sms_all_calls, sms_inbound_messages, sms_all_messages,
  slack_enabled, slack_channel,
  slack_inbound_calls, slack_all_calls, slack_inbound_messages, slack_all_messages,
  push_enabled, push_inbound_calls, push_all_calls, push_inbound_messages, push_all_messages,
  created_at, updated_at
)
SELECT
  np.user_id, ac.id AS agent_id,
  np.email_enabled, np.email_address,
  np.email_inbound_calls, np.email_all_calls, np.email_inbound_messages, np.email_all_messages,
  np.sms_enabled, np.sms_phone_number,
  np.sms_inbound_calls, np.sms_all_calls, np.sms_inbound_messages, np.sms_all_messages,
  np.slack_enabled, np.slack_channel,
  np.slack_inbound_calls, np.slack_all_calls, np.slack_inbound_messages, np.slack_all_messages,
  np.push_enabled, np.push_inbound_calls, np.push_all_calls, np.push_inbound_messages, np.push_all_messages,
  NOW(), NOW()
FROM notification_preferences np
JOIN agent_configs ac ON ac.user_id = np.user_id
WHERE np.agent_id IS NULL
ON CONFLICT (user_id, agent_id) DO NOTHING;
