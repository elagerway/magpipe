-- Semantic Match Actions: automated alerts when recurring patterns are detected
CREATE TABLE IF NOT EXISTS semantic_match_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  monitored_topics TEXT[] DEFAULT '{}',
  match_threshold INTEGER DEFAULT 3,
  action_type TEXT NOT NULL CHECK (action_type IN ('sms', 'email', 'slack', 'hubspot', 'webhook')),
  action_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_semantic_match_actions_agent_id ON semantic_match_actions(agent_id);
CREATE INDEX idx_semantic_match_actions_user_id ON semantic_match_actions(user_id);

-- RLS
ALTER TABLE semantic_match_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_actions" ON semantic_match_actions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all" ON semantic_match_actions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER set_updated_at BEFORE UPDATE ON semantic_match_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
