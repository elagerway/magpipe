-- MCP Integration Schema
-- This migration creates the foundation for the MCP tool server

-- Integration providers catalog (available integrations)
CREATE TABLE IF NOT EXISTS integration_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,           -- 'slack', 'hubspot', 'cal_com'
  name TEXT NOT NULL,                   -- Display name
  description TEXT,
  icon_url TEXT,
  category TEXT,                        -- 'communication', 'crm', 'calendar'
  oauth_type TEXT,                      -- 'oauth2', 'oauth2_pkce', 'api_key'
  oauth_config JSONB DEFAULT '{}',      -- auth_url, token_url, scopes, etc.
  tools_schema JSONB DEFAULT '[]',      -- MCP tool definitions
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User's connected integrations
CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'connected',      -- connected, expired, error, pending
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  external_user_id TEXT,                -- Provider's user ID
  external_workspace_id TEXT,           -- For Slack workspace, etc.
  config JSONB DEFAULT '{}',            -- Provider-specific settings
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

-- Tool execution audit log
CREATE TABLE IF NOT EXISTS integration_tool_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES user_integrations(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  tool_source TEXT DEFAULT 'builtin',   -- 'builtin' or provider slug
  input JSONB,
  output JSONB,
  success BOOLEAN,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_providers_slug ON integration_providers(slug);
CREATE INDEX IF NOT EXISTS idx_integration_providers_category ON integration_providers(category);
CREATE INDEX IF NOT EXISTS idx_integration_providers_enabled ON integration_providers(enabled);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider_id ON user_integrations(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status ON user_integrations(status);

CREATE INDEX IF NOT EXISTS idx_integration_tool_logs_user_id ON integration_tool_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_tool_logs_tool_name ON integration_tool_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_integration_tool_logs_created_at ON integration_tool_logs(created_at);

-- Enable RLS
ALTER TABLE integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tool_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for integration_providers (read-only for authenticated users)
DROP POLICY IF EXISTS "Users can view enabled integration providers" ON integration_providers;
CREATE POLICY "Users can view enabled integration providers"
  ON integration_providers FOR SELECT
  TO authenticated
  USING (enabled = true);

-- RLS Policies for user_integrations
DROP POLICY IF EXISTS "Users can view their own integrations" ON user_integrations;
CREATE POLICY "Users can view their own integrations"
  ON user_integrations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own integrations" ON user_integrations;
CREATE POLICY "Users can insert their own integrations"
  ON user_integrations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own integrations" ON user_integrations;
CREATE POLICY "Users can update their own integrations"
  ON user_integrations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own integrations" ON user_integrations;
CREATE POLICY "Users can delete their own integrations"
  ON user_integrations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for integration_tool_logs
DROP POLICY IF EXISTS "Users can view their own tool logs" ON integration_tool_logs;
CREATE POLICY "Users can view their own tool logs"
  ON integration_tool_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own tool logs" ON integration_tool_logs;
CREATE POLICY "Users can insert their own tool logs"
  ON integration_tool_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role needs full access for Edge Functions
DROP POLICY IF EXISTS "Service role has full access to providers" ON integration_providers;
CREATE POLICY "Service role has full access to providers"
  ON integration_providers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to user_integrations" ON user_integrations;
CREATE POLICY "Service role has full access to user_integrations"
  ON user_integrations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to tool_logs" ON integration_tool_logs;
CREATE POLICY "Service role has full access to tool_logs"
  ON integration_tool_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger function (reuse existing if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_integration_providers_updated_at ON integration_providers;
CREATE TRIGGER update_integration_providers_updated_at
  BEFORE UPDATE ON integration_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_integrations_updated_at ON user_integrations;
CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert built-in provider (for built-in tools)
INSERT INTO integration_providers (slug, name, description, category, oauth_type, enabled)
VALUES ('builtin', 'Built-in Tools', 'Core Maggie features like contacts, SMS, and calling', 'core', NULL, true)
ON CONFLICT (slug) DO NOTHING;

-- Insert Cal.com provider (migrate existing Cal.com integration)
INSERT INTO integration_providers (
  slug, name, description, category, oauth_type,
  oauth_config, tools_schema, enabled
)
VALUES (
  'cal_com',
  'Cal.com',
  'Calendar scheduling and appointment booking',
  'calendar',
  'oauth2_pkce',
  '{
    "auth_url": "https://app.cal.com/oauth/authorize",
    "token_url": "https://api.cal.com/v2/oauth/token",
    "scopes": ["READ_PROFILE", "READ_BOOKING", "WRITE_BOOKING"]
  }'::jsonb,
  '[
    {
      "name": "check_calendar_availability",
      "description": "Check available time slots for calendar bookings",
      "parameters": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "The date to check availability for (YYYY-MM-DD format or relative like tomorrow)"
          },
          "duration": {
            "type": "integer",
            "description": "Duration in minutes (default 30)"
          }
        },
        "required": ["date"]
      }
    },
    {
      "name": "book_calendar_appointment",
      "description": "Book an appointment on the calendar",
      "parameters": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Title of the appointment"
          },
          "start_time": {
            "type": "string",
            "description": "Start time in ISO 8601 format or natural language"
          },
          "attendee_name": {
            "type": "string",
            "description": "Name of the person being booked"
          },
          "attendee_email": {
            "type": "string",
            "description": "Email of the attendee (optional)"
          },
          "attendee_phone": {
            "type": "string",
            "description": "Phone number of the attendee (optional)"
          },
          "duration": {
            "type": "integer",
            "description": "Duration in minutes (default 30)"
          },
          "location": {
            "type": "string",
            "description": "Meeting location or video link"
          },
          "purpose": {
            "type": "string",
            "description": "Purpose or notes for the meeting"
          }
        },
        "required": ["title", "start_time", "attendee_name"]
      }
    }
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  tools_schema = EXCLUDED.tools_schema,
  oauth_config = EXCLUDED.oauth_config,
  updated_at = NOW();

-- Insert placeholder Slack provider (for Phase 4)
INSERT INTO integration_providers (
  slug, name, description, category, oauth_type,
  oauth_config, tools_schema, enabled
)
VALUES (
  'slack',
  'Slack',
  'Send messages and interact with your Slack workspace',
  'communication',
  'oauth2',
  '{
    "auth_url": "https://slack.com/oauth/v2/authorize",
    "token_url": "https://slack.com/api/oauth.v2.access",
    "scopes": ["chat:write", "channels:read", "users:read"]
  }'::jsonb,
  '[
    {
      "name": "slack_send_message",
      "description": "Send a message to a Slack channel or user",
      "parameters": {
        "type": "object",
        "properties": {
          "channel": {
            "type": "string",
            "description": "Channel name (e.g., #general) or user ID"
          },
          "message": {
            "type": "string",
            "description": "The message to send"
          }
        },
        "required": ["channel", "message"]
      }
    },
    {
      "name": "slack_list_channels",
      "description": "List available Slack channels",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  tools_schema = EXCLUDED.tools_schema,
  oauth_config = EXCLUDED.oauth_config,
  updated_at = NOW();

-- Migrate existing Cal.com connections from users table to user_integrations
INSERT INTO user_integrations (user_id, provider_id, status, access_token, refresh_token, token_expires_at, config)
SELECT
  u.id,
  (SELECT id FROM integration_providers WHERE slug = 'cal_com'),
  'connected',
  u.cal_com_access_token,
  u.cal_com_refresh_token,
  u.cal_com_token_expires_at,
  jsonb_build_object(
    'default_event_type_id', u.cal_com_default_event_type_id,
    'user_id', u.cal_com_user_id
  )
FROM users u
WHERE u.cal_com_access_token IS NOT NULL
ON CONFLICT (user_id, provider_id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  token_expires_at = EXCLUDED.token_expires_at,
  config = EXCLUDED.config,
  updated_at = NOW();

COMMENT ON TABLE integration_providers IS 'Catalog of available integration providers (Slack, HubSpot, etc.)';
COMMENT ON TABLE user_integrations IS 'User-specific integration connections with OAuth tokens';
COMMENT ON TABLE integration_tool_logs IS 'Audit log of tool executions for debugging and analytics';
