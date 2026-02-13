-- Email Messages table: stores email threads for inbox display
CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  thread_id TEXT NOT NULL,
  gmail_message_id TEXT UNIQUE,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  cc TEXT,
  bcc TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'draft', 'pending')),
  is_ai_generated BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  ai_draft TEXT,
  ai_draft_status TEXT CHECK (ai_draft_status IN ('pending', 'sent', 'rejected')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_messages_user_id ON email_messages(user_id);
CREATE INDEX idx_email_messages_thread_id ON email_messages(thread_id);
CREATE INDEX idx_email_messages_contact_id ON email_messages(contact_id);
CREATE INDEX idx_email_messages_sent_at ON email_messages(user_id, sent_at DESC);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_messages"
  ON email_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access email_messages"
  ON email_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE email_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE email_messages;
