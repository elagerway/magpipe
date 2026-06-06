-- =============================================================================
-- Agent Skills Framework: skill_definitions, agent_skills, skill_executions
-- =============================================================================

-- 1. skill_definitions — catalog of available skills
CREATE TABLE IF NOT EXISTS skill_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sales', 'support', 'operations', 'marketing', 'research')),
  icon TEXT,
  supported_triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  supported_events JSONB DEFAULT '[]'::jsonb,
  supported_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_integrations JSONB DEFAULT '[]'::jsonb,
  config_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  handler_id TEXT NOT NULL,
  agent_type_filter JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. agent_skills — per-agent skill configuration
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  skill_definition_id UUID NOT NULL REFERENCES skill_definitions(id),
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  trigger_type TEXT CHECK (trigger_type IN ('event', 'schedule', 'on_demand')),
  schedule_config JSONB DEFAULT '{}'::jsonb,
  event_config JSONB DEFAULT '{}'::jsonb,
  delivery_channels JSONB DEFAULT '[]'::jsonb,
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, skill_definition_id)
);

-- 3. skill_executions — execution log
CREATE TABLE IF NOT EXISTS skill_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  agent_skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  skill_definition_id UUID NOT NULL REFERENCES skill_definitions(id),
  trigger_type TEXT NOT NULL,
  trigger_context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  result JSONB DEFAULT '{}'::jsonb,
  deliveries JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_skill_executions_agent_status ON skill_executions(agent_id, status);
CREATE INDEX idx_skill_executions_agent_skill ON skill_executions(agent_skill_id, created_at DESC);
CREATE INDEX idx_skill_executions_pending ON skill_executions(status) WHERE status = 'pending';
CREATE INDEX idx_agent_skills_agent ON agent_skills(agent_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE skill_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read skill definitions"
  ON skill_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access to skill definitions"
  ON skill_definitions FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view skills for own agents"
  ON agent_skills FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert skills for own agents"
  ON agent_skills FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

CREATE POLICY "Users can update skills for own agents"
  ON agent_skills FOR UPDATE TO authenticated
  USING (agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete skills for own agents"
  ON agent_skills FOR DELETE TO authenticated
  USING (agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to agent skills"
  ON agent_skills FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view executions for own agents"
  ON skill_executions FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

CREATE POLICY "Users can cancel pending executions for own agents"
  ON skill_executions FOR UPDATE TO authenticated
  USING (agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()) AND status = 'pending');

CREATE POLICY "Service role full access to skill executions"
  ON skill_executions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Extend scheduled_actions CHECK constraint
-- =============================================================================
ALTER TABLE scheduled_actions DROP CONSTRAINT IF EXISTS scheduled_actions_action_type_check;
ALTER TABLE scheduled_actions ADD CONSTRAINT scheduled_actions_action_type_check
  CHECK (action_type IN ('send_sms', 'call_contact', 'execute_skill'));

-- =============================================================================
-- Seed 7 built-in skill definitions
-- =============================================================================

INSERT INTO skill_definitions (slug, name, description, category, icon, supported_triggers, supported_events, supported_channels, required_integrations, config_schema, handler_id, agent_type_filter, sort_order)
VALUES
('post_call_followup', 'Post-Call Follow-Up', 'Automatically send a follow-up SMS or email to callers after a call ends. Customize the message template and delay.', 'sales', 'phone-forwarded', '["event"]'::jsonb, '["call_ends"]'::jsonb, '["sms", "email"]'::jsonb, '[]'::jsonb, '{"type":"object","properties":{"delay_minutes":{"type":"number","default":30,"title":"Delay after call (minutes)"},"message_template":{"type":"string","title":"Message template","default":"Hi {{caller_name}}, thank you for calling {{organization_name}}. {{custom_message}}"},"min_call_duration_seconds":{"type":"number","default":10,"title":"Minimum call duration (seconds)"},"consent_confirmed":{"type":"boolean","default":false,"title":"I confirm contacts have consented to follow-up messages"}},"required":["message_template","consent_confirmed"]}'::jsonb, 'post_call_followup', '["inbound_voice","outbound_voice"]'::jsonb, 1),
('appointment_reminder', 'Appointment Reminder', 'Call or text contacts before their scheduled appointments to confirm attendance. Supports voice call with SMS fallback.', 'operations', 'calendar-clock', '["event"]'::jsonb, '["appointment_upcoming"]'::jsonb, '["voice_call","sms"]'::jsonb, '["cal_com"]'::jsonb, '{"type":"object","properties":{"reminder_hours_before":{"type":"number","default":24,"title":"Hours before appointment"},"message_template":{"type":"string","title":"Reminder message","default":"Hi {{contact_name}}, this is a reminder about your appointment on {{appointment_date}} at {{appointment_time}}."},"fallback_to_sms":{"type":"boolean","default":true,"title":"Send SMS if call not answered"},"consent_confirmed":{"type":"boolean","default":false,"title":"I confirm contacts have consented to reminder messages"}},"required":["message_template","consent_confirmed"]}'::jsonb, 'appointment_reminder', '[]'::jsonb, 1),
('competitor_monitoring', 'Competitor Monitoring', 'Monitor competitor websites daily for changes to pricing, features, or content. Receive a digest via Slack or email.', 'research', 'eye', '["schedule"]'::jsonb, '[]'::jsonb, '["slack","email"]'::jsonb, '[]'::jsonb, '{"type":"object","properties":{"urls":{"type":"array","items":{"type":"string"},"title":"URLs to monitor","maxItems":10},"check_for":{"type":"string","enum":["any_changes","pricing_changes","new_content","all"],"default":"all","title":"What to check for"},"digest_format":{"type":"string","enum":["summary","detailed"],"default":"summary","title":"Digest format"}},"required":["urls"]}'::jsonb, 'competitor_monitoring', '[]'::jsonb, 1),
('daily_news_digest', 'Daily News Digest', 'Get a daily summary of industry news and trends relevant to your business, delivered to Slack or email each morning.', 'research', 'newspaper', '["schedule"]'::jsonb, '[]'::jsonb, '["slack","email"]'::jsonb, '[]'::jsonb, '{"type":"object","properties":{"topics":{"type":"array","items":{"type":"string"},"title":"Topics to track","maxItems":10},"sources":{"type":"array","items":{"type":"string"},"title":"Preferred news sources (domains)","maxItems":5},"digest_format":{"type":"string","enum":["summary","detailed"],"default":"summary","title":"Digest format"}},"required":["topics"]}'::jsonb, 'daily_news_digest', '[]'::jsonb, 2),
('auto_crm_update', 'Auto-CRM Update', 'Automatically push extracted call data to your CRM after every call. Maps dynamic variables to CRM contact fields.', 'sales', 'database', '["event"]'::jsonb, '["call_ends"]'::jsonb, '[]'::jsonb, '["hubspot"]'::jsonb, '{"type":"object","properties":{"create_note":{"type":"boolean","default":true,"title":"Create a call note in CRM"},"update_contact_fields":{"type":"boolean","default":true,"title":"Update contact fields with extracted data"},"field_mapping":{"type":"object","title":"Field mapping (extracted variable → CRM field)","default":{}}},"required":[]}'::jsonb, 'auto_crm_update', '["inbound_voice","outbound_voice"]'::jsonb, 2),
('social_media_monitoring', 'Social Media Monitoring', 'Track brand mentions and keywords across Reddit, Hacker News, X, LinkedIn, and Google. Get alerts when your brand is discussed.', 'marketing', 'share-2', '["schedule"]'::jsonb, '[]'::jsonb, '["slack","email"]'::jsonb, '[]'::jsonb, '{"type":"object","properties":{"keywords":{"type":"array","items":{"type":"string"},"title":"Keywords to track","maxItems":10},"platforms":{"type":"array","items":{"type":"string","enum":["reddit","hackernews","google","x","linkedin"]},"title":"Platforms to monitor","default":["reddit","hackernews","google"]},"digest_format":{"type":"string","enum":["summary","detailed"],"default":"summary","title":"Digest format"}},"required":["keywords"]}'::jsonb, 'social_media_monitoring', '[]'::jsonb, 1),
('review_request', 'Review Request Campaign', 'Send review request messages to recent callers asking them to leave a review. Respects minimum time between requests.', 'marketing', 'star', '["schedule"]'::jsonb, '[]'::jsonb, '["sms","email"]'::jsonb, '[]'::jsonb, '{"type":"object","properties":{"message_template":{"type":"string","title":"Review request message","default":"Hi {{caller_name}}, thank you for choosing {{organization_name}}! We would love your feedback. Please leave us a review: {{review_url}}"},"review_url":{"type":"string","title":"Review page URL"},"min_days_since_last_request":{"type":"number","default":30,"title":"Minimum days between requests to same contact"},"consent_confirmed":{"type":"boolean","default":false,"title":"I confirm contacts have consented to review requests"}},"required":["message_template","review_url","consent_confirmed"]}'::jsonb, 'review_request', '[]'::jsonb, 2)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, config_schema = EXCLUDED.config_schema,
  supported_triggers = EXCLUDED.supported_triggers, supported_events = EXCLUDED.supported_events,
  supported_channels = EXCLUDED.supported_channels, required_integrations = EXCLUDED.required_integrations,
  agent_type_filter = EXCLUDED.agent_type_filter, updated_at = NOW();
