-- Chat Widget Schema
-- Enables website chat widgets that connect visitors to AI agents

-- Widget configuration table
CREATE TABLE chat_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  widget_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  name TEXT DEFAULT 'Website Chat',

  -- Appearance
  primary_color TEXT DEFAULT '#6366f1',
  position TEXT DEFAULT 'bottom-right',
  offset_x INTEGER DEFAULT 20,
  offset_y INTEGER DEFAULT 20,
  welcome_message TEXT DEFAULT 'Hi! How can I help you today?',
  offline_message TEXT DEFAULT 'Leave a message and we''ll get back to you.',

  -- Behavior
  collect_visitor_name BOOLEAN DEFAULT true,
  collect_visitor_email BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_portal_widget BOOLEAN DEFAULT false,
  allowed_domains TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions (one per visitor conversation)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID REFERENCES chat_widgets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,

  -- Visitor info
  visitor_id TEXT NOT NULL,
  visitor_name TEXT,
  visitor_email TEXT,

  -- Metadata
  page_url TEXT,
  browser_info JSONB DEFAULT '{}',

  -- Status
  status TEXT DEFAULT 'active',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),

  -- Human handoff: AI pauses when owner takes over
  ai_paused_until TIMESTAMPTZ DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,

  role TEXT NOT NULL CHECK (role IN ('visitor', 'agent', 'system')),
  content TEXT NOT NULL,
  is_ai_generated BOOLEAN DEFAULT false,

  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_widgets_user_id ON chat_widgets(user_id);
CREATE INDEX idx_chat_widgets_agent_id ON chat_widgets(agent_id);
CREATE INDEX idx_chat_widgets_widget_key ON chat_widgets(widget_key);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id, last_message_at DESC);
CREATE INDEX idx_chat_sessions_widget_id ON chat_sessions(widget_id);
CREATE INDEX idx_chat_sessions_visitor_id ON chat_sessions(visitor_id);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id, created_at ASC);

-- Enable realtime for chat messages and sessions
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;

-- RLS policies
ALTER TABLE chat_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Widget policies: Users can manage their own widgets
CREATE POLICY "Users manage own widgets" ON chat_widgets
  FOR ALL USING (auth.uid() = user_id);

-- Session policies: Users can view their own sessions, service role manages all
CREATE POLICY "Users view own sessions" ON chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages sessions" ON chat_sessions
  FOR ALL USING (true);

-- Message policies: Users can view messages from their sessions
CREATE POLICY "Users view own messages" ON chat_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users insert messages to own sessions" ON chat_messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages messages" ON chat_messages
  FOR ALL USING (true);

-- Update trigger for chat_widgets.updated_at
CREATE OR REPLACE FUNCTION update_chat_widget_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_widgets_updated_at
  BEFORE UPDATE ON chat_widgets
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_widget_updated_at();

-- Update trigger for chat_sessions.last_message_at when messages are added
CREATE OR REPLACE FUNCTION update_chat_session_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET last_message_at = NOW()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_messages_update_session
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_last_message();
