-- Support Email Ticket System
-- Stores Gmail-synced support emails with AI draft capabilities

-- 1. Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT UNIQUE,
  thread_id TEXT,
  from_email TEXT,
  from_name TEXT,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  labels TEXT[],
  ai_draft TEXT,
  ai_draft_status TEXT CHECK (ai_draft_status IN ('pending', 'approved', 'rejected', 'sent')),
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_tickets_thread_id ON support_tickets(thread_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_received_at ON support_tickets(received_at DESC);
CREATE INDEX idx_support_tickets_gmail_message_id ON support_tickets(gmail_message_id);

-- 2. Support email config (singleton)
CREATE TABLE IF NOT EXISTS support_email_config (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  gmail_address TEXT,
  last_history_id TEXT,
  last_polled_at TIMESTAMPTZ,
  sms_alert_enabled BOOLEAN DEFAULT false,
  sms_alert_phone TEXT,
  agent_mode TEXT NOT NULL DEFAULT 'off' CHECK (agent_mode IN ('off', 'draft', 'auto')),
  agent_system_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the singleton config row
INSERT INTO support_email_config (id) VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed google_email integration provider
INSERT INTO integration_providers (id, slug, name, description, category, oauth_type, oauth_config, enabled)
VALUES (
  gen_random_uuid(),
  'google_email',
  'Google Email (Gmail)',
  'Connect Gmail to sync support emails',
  'email',
  'oauth2',
  '{
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_url": "https://oauth2.googleapis.com/token",
    "scopes": ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  oauth_config = EXCLUDED.oauth_config,
  enabled = EXCLUDED.enabled;

-- 4. Schedule 5-minute Gmail polling cron
SELECT cron.schedule(
  'poll-gmail-tickets',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/poll-gmail-tickets',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
