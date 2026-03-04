-- MCP Server Support Migration
-- Allows users to add custom MCP servers and connect to catalog servers

-- 1. Curated MCP Server Catalog
CREATE TABLE IF NOT EXISTS mcp_server_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT,                        -- 'development', 'productivity', 'search', 'communication', etc.
  server_url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none',        -- 'api_key', 'bearer', 'oauth2', 'none'
  auth_header_name TEXT DEFAULT 'Authorization',
  auth_config JSONB DEFAULT '{}',       -- Additional auth configuration
  featured BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User's Custom MCP Servers
CREATE TABLE IF NOT EXISTS user_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  server_url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none',        -- 'api_key', 'bearer', 'none'
  api_key_encrypted TEXT,               -- Encrypted API key
  status TEXT DEFAULT 'pending',        -- pending, active, error, disabled
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  tools_cache JSONB DEFAULT '[]',       -- Cached tool definitions
  tools_cached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, server_url)
);

-- 3. User Connections to Catalog Servers
CREATE TABLE IF NOT EXISTS user_mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_server_id UUID NOT NULL REFERENCES mcp_server_catalog(id) ON DELETE CASCADE,
  api_key_encrypted TEXT,               -- Encrypted API key if required
  status TEXT DEFAULT 'connected',      -- connected, error, disabled
  config JSONB DEFAULT '{}',            -- Server-specific configuration
  last_connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT,
  tools_cache JSONB DEFAULT '[]',       -- Cached tool definitions
  tools_cached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, catalog_server_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_mcp_servers_user ON user_mcp_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mcp_servers_status ON user_mcp_servers(status);
CREATE INDEX IF NOT EXISTS idx_user_mcp_connections_user ON user_mcp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mcp_connections_status ON user_mcp_connections(status);
CREATE INDEX IF NOT EXISTS idx_mcp_catalog_category ON mcp_server_catalog(category);
CREATE INDEX IF NOT EXISTS idx_mcp_catalog_featured ON mcp_server_catalog(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_mcp_catalog_enabled ON mcp_server_catalog(enabled) WHERE enabled = true;

-- RLS Policies
ALTER TABLE mcp_server_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mcp_connections ENABLE ROW LEVEL SECURITY;

-- Catalog is public read
DROP POLICY IF EXISTS "Anyone can view enabled catalog servers" ON mcp_server_catalog;
CREATE POLICY "Anyone can view enabled catalog servers"
  ON mcp_server_catalog FOR SELECT
  USING (enabled = true);

-- Users can only see their own custom servers
DROP POLICY IF EXISTS "Users can view their own MCP servers" ON user_mcp_servers;
CREATE POLICY "Users can view their own MCP servers"
  ON user_mcp_servers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own MCP servers" ON user_mcp_servers;
CREATE POLICY "Users can insert their own MCP servers"
  ON user_mcp_servers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own MCP servers" ON user_mcp_servers;
CREATE POLICY "Users can update their own MCP servers"
  ON user_mcp_servers FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own MCP servers" ON user_mcp_servers;
CREATE POLICY "Users can delete their own MCP servers"
  ON user_mcp_servers FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own connections
DROP POLICY IF EXISTS "Users can view their own MCP connections" ON user_mcp_connections;
CREATE POLICY "Users can view their own MCP connections"
  ON user_mcp_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own MCP connections" ON user_mcp_connections;
CREATE POLICY "Users can insert their own MCP connections"
  ON user_mcp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own MCP connections" ON user_mcp_connections;
CREATE POLICY "Users can update their own MCP connections"
  ON user_mcp_connections FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own MCP connections" ON user_mcp_connections;
CREATE POLICY "Users can delete their own MCP connections"
  ON user_mcp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access for Edge Functions
DROP POLICY IF EXISTS "Service role full access to catalog" ON mcp_server_catalog;
CREATE POLICY "Service role full access to catalog"
  ON mcp_server_catalog FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role full access to user servers" ON user_mcp_servers;
CREATE POLICY "Service role full access to user servers"
  ON user_mcp_servers FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role full access to user connections" ON user_mcp_connections;
CREATE POLICY "Service role full access to user connections"
  ON user_mcp_connections FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_mcp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_mcp_server_catalog_updated_at ON mcp_server_catalog;
CREATE TRIGGER update_mcp_server_catalog_updated_at
  BEFORE UPDATE ON mcp_server_catalog
  FOR EACH ROW EXECUTE FUNCTION update_mcp_updated_at();

DROP TRIGGER IF EXISTS update_user_mcp_servers_updated_at ON user_mcp_servers;
CREATE TRIGGER update_user_mcp_servers_updated_at
  BEFORE UPDATE ON user_mcp_servers
  FOR EACH ROW EXECUTE FUNCTION update_mcp_updated_at();

DROP TRIGGER IF EXISTS update_user_mcp_connections_updated_at ON user_mcp_connections;
CREATE TRIGGER update_user_mcp_connections_updated_at
  BEFORE UPDATE ON user_mcp_connections
  FOR EACH ROW EXECUTE FUNCTION update_mcp_updated_at();

-- Seed initial catalog data
INSERT INTO mcp_server_catalog (slug, name, description, category, server_url, auth_type, featured, verified) VALUES
  -- Featured servers
  ('brave-search', 'Brave Search', 'Search the web using Brave Search API', 'search', 'https://mcp.brave.com/v1', 'api_key', true, true),
  ('exa', 'Exa', 'AI-powered web search with semantic understanding', 'search', 'https://mcp.exa.ai/v1', 'api_key', true, true),
  ('github', 'GitHub', 'Create issues, PRs, and manage repositories', 'development', 'https://api.githubcopilot.com/mcp', 'bearer', true, true),
  ('linear', 'Linear', 'Create and manage Linear issues and projects', 'development', 'https://mcp.linear.app/v1', 'api_key', true, true),
  ('notion', 'Notion', 'Search and update Notion pages and databases', 'productivity', 'https://mcp.notion.so/v1', 'bearer', true, true),
  ('slack', 'Slack', 'Send messages, manage channels, and interact with your Slack workspace', 'communication', 'https://mcp.slack.com/v1', 'bearer', true, true),
  ('hubspot', 'HubSpot', 'Access CRM data - contacts, companies, deals, tickets, and more', 'crm', 'https://mcp.hubspot.com/sse', 'bearer', true, true),
  ('salesforce', 'Salesforce', 'Access CRM data - leads, accounts, opportunities, and more', 'crm', 'https://mcp.salesforce.com/v1', 'bearer', true, true),
  ('stripe', 'Stripe', 'Manage payments, subscriptions, customers, and financial data', 'payments', 'https://mcp.stripe.com', 'bearer', true, true),
  ('shopify', 'Shopify', 'Manage products, orders, customers, and storefronts', 'ecommerce', 'https://mcp.shopify.com/v1', 'bearer', true, true),
  ('twilio', 'Twilio', 'Send SMS, make calls, and manage phone numbers', 'communication', 'https://mcp.twilio.com/v1', 'api_key', true, true),
  ('google-calendar', 'Google Calendar', 'Manage events, check availability, and schedule meetings', 'calendar', 'https://mcp.google.com/calendar/v1', 'bearer', true, true),
  -- Communication
  ('discord', 'Discord', 'Send messages, manage channels, and interact with Discord servers', 'communication', 'https://mcp.discord.com/v1', 'bearer', false, true),
  -- Productivity
  ('asana', 'Asana', 'Manage tasks, projects, and team workspaces', 'productivity', 'https://mcp.asana.com/v1', 'bearer', false, true),
  ('trello', 'Trello', 'Manage boards, cards, and lists for project tracking', 'productivity', 'https://mcp.trello.com/v1', 'api_key', false, true),
  ('airtable', 'Airtable', 'Access and manage bases, tables, and records', 'productivity', 'https://mcp.airtable.com/v1', 'bearer', false, true),
  ('monday', 'Monday.com', 'Manage workspaces, boards, and items', 'productivity', 'https://mcp.monday.com/v1', 'api_key', false, true),
  ('confluence', 'Confluence', 'Search and manage documentation and knowledge bases', 'productivity', 'https://mcp.atlassian.com/confluence/v1', 'bearer', false, true),
  -- Development
  ('jira', 'Jira', 'Create and manage issues, sprints, and projects', 'development', 'https://mcp.atlassian.com/jira/v1', 'bearer', false, true),
  ('gitlab', 'GitLab', 'Manage repositories, issues, merge requests, and CI/CD', 'development', 'https://mcp.gitlab.com/v1', 'bearer', false, true),
  ('sentry', 'Sentry', 'Monitor errors, performance, and application health', 'development', 'https://mcp.sentry.io/v1', 'bearer', false, true),
  -- Database
  ('sqlite', 'SQLite', 'Query and manage SQLite databases', 'database', 'https://mcp.sqlite.dev/v1', 'none', false, true),
  ('postgres', 'PostgreSQL', 'Connect to PostgreSQL databases', 'database', 'https://mcp.postgres.dev/v1', 'api_key', false, true),
  ('mongodb', 'MongoDB', 'Query and manage MongoDB databases', 'database', 'https://mcp.mongodb.com/v1', 'api_key', false, true),
  ('supabase', 'Supabase', 'Database, authentication, and edge functions', 'database', 'https://mcp.supabase.com/v1', 'bearer', false, true),
  -- Cloud
  ('cloudflare', 'Cloudflare', 'Manage Workers, KV, R2, and D1 resources', 'cloud', 'https://mcp.cloudflare.com/v1', 'bearer', false, true),
  ('vercel', 'Vercel', 'Deploy and manage Vercel projects and domains', 'cloud', 'https://mcp.vercel.com/v1', 'bearer', false, true),
  -- Storage
  ('google-drive', 'Google Drive', 'Search, read, and manage files in Google Drive', 'storage', 'https://mcp.google.com/drive/v1', 'bearer', false, true),
  ('dropbox', 'Dropbox', 'Access and manage files in Dropbox', 'storage', 'https://mcp.dropbox.com/v1', 'bearer', false, true),
  -- Support
  ('zendesk', 'Zendesk', 'Manage support tickets, users, and knowledge base', 'support', 'https://mcp.zendesk.com/v1', 'bearer', false, true),
  ('intercom', 'Intercom', 'Manage conversations, contacts, and help articles', 'support', 'https://mcp.intercom.com/v1', 'bearer', false, true),
  -- Marketing
  ('mailchimp', 'Mailchimp', 'Manage email campaigns, audiences, and automations', 'marketing', 'https://mcp.mailchimp.com/v1', 'api_key', false, true),
  ('sendgrid', 'SendGrid', 'Send emails and manage email templates', 'marketing', 'https://mcp.sendgrid.com/v1', 'api_key', false, true),
  -- Design
  ('figma', 'Figma', 'Access design files, components, and team projects', 'design', 'https://mcp.figma.com/v1', 'bearer', false, true),
  -- Automation
  ('zapier', 'Zapier', 'Trigger automations and manage Zaps', 'automation', 'https://mcp.zapier.com/v1', 'bearer', false, true),
  ('make', 'Make (Integromat)', 'Trigger and manage automation scenarios', 'automation', 'https://mcp.make.com/v1', 'api_key', false, true),
  ('puppeteer', 'Puppeteer', 'Browser automation and web scraping', 'automation', 'https://mcp.puppeteer.dev/v1', 'none', false, true),
  -- Web Scraping
  ('firecrawl', 'Firecrawl', 'Web scraping and content extraction for any website', 'web-scraping', 'https://mcp.firecrawl.dev/v1', 'api_key', false, true),
  -- Utility
  ('filesystem', 'File System', 'Read and write files on the server', 'utility', 'https://mcp.filesystem.dev/v1', 'none', false, true)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE mcp_server_catalog IS 'Curated catalog of MCP servers available for users to connect';
COMMENT ON TABLE user_mcp_servers IS 'Custom MCP servers added by users';
COMMENT ON TABLE user_mcp_connections IS 'User connections to catalog MCP servers';
