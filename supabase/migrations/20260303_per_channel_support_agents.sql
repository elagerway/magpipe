-- Per-channel support agent selection
-- Adds SMS and Chat agent config alongside existing email agent (support_agent_id + agent_mode)

ALTER TABLE support_email_config
  ADD COLUMN sms_agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  ADD COLUMN sms_agent_mode TEXT NOT NULL DEFAULT 'off' CHECK (sms_agent_mode IN ('off', 'draft', 'auto')),
  ADD COLUMN chat_agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  ADD COLUMN chat_agent_mode TEXT NOT NULL DEFAULT 'off' CHECK (chat_agent_mode IN ('off', 'draft', 'auto'));
