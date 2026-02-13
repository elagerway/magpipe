-- Agent Email Configs: per-agent email deployment channel
CREATE TABLE IF NOT EXISTS agent_email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES user_integrations(id) ON DELETE SET NULL,
  gmail_address TEXT,
  send_as_email TEXT,
  agent_mode TEXT NOT NULL DEFAULT 'off' CHECK (agent_mode IN ('off', 'draft', 'auto')),
  is_active BOOLEAN DEFAULT true,
  last_history_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id)
);

CREATE INDEX idx_agent_email_configs_user_id ON agent_email_configs(user_id);
CREATE INDEX idx_agent_email_configs_agent_id ON agent_email_configs(agent_id);

ALTER TABLE agent_email_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own agent email configs"
  ON agent_email_configs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access to agent_email_configs"
  ON agent_email_configs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
