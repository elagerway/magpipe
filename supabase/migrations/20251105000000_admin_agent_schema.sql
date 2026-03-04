-- Migration: Admin Agent & Home Page Redesign
-- Feature: 003-admin-agent-home
-- Created: 2025-11-05
-- Description: Creates schema for conversational admin agent, knowledge base with vector embeddings, and phone admin access

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Store this for verification
COMMENT ON EXTENSION vector IS 'Vector similarity search for knowledge base embeddings';

-- ============================================================================
-- TABLE: admin_conversations
-- Purpose: Track ongoing conversations between user and admin agent
-- ============================================================================
CREATE TABLE admin_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_conversations IS 'Conversations between users and admin agent for configuration';
COMMENT ON COLUMN admin_conversations.context IS 'Stores pending actions and conversation state as JSON';

-- ============================================================================
-- TABLE: admin_messages
-- Purpose: Store individual messages in admin conversations
-- ============================================================================
CREATE TABLE admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES admin_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  function_call JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_messages IS 'Message history for admin agent conversations';
COMMENT ON COLUMN admin_messages.function_call IS 'OpenAI function call data if message triggered an action';

-- ============================================================================
-- TABLE: knowledge_sources
-- Purpose: Track URLs added to knowledge base
-- ============================================================================
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  sync_period TEXT CHECK (sync_period IN ('24h', '7d', '1mo', '3mo')) DEFAULT '7d',
  sync_status TEXT CHECK (sync_status IN ('pending', 'syncing', 'completed', 'failed')) DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE knowledge_sources IS 'URLs added to user knowledge base for AI agent to reference';
COMMENT ON COLUMN knowledge_sources.sync_period IS 'How often to re-fetch and update this source';

-- ============================================================================
-- TABLE: knowledge_chunks
-- Purpose: Store chunked content with vector embeddings
-- ============================================================================
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE knowledge_chunks IS 'Chunked content with embeddings for semantic search';
COMMENT ON COLUMN knowledge_chunks.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions)';

-- ============================================================================
-- TABLE: access_code_attempts
-- Purpose: Track phone admin access code verification attempts
-- ============================================================================
CREATE TABLE access_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  input_received TEXT,
  ip_address INET,
  user_agent TEXT,
  lockout_triggered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE access_code_attempts IS 'Tracks access code verification attempts for security and rate limiting';
COMMENT ON COLUMN access_code_attempts.input_received IS 'Voice transcription of what user said (for debugging)';

-- ============================================================================
-- TABLE: sms_confirmations
-- Purpose: Track SMS confirmation codes for access code changes
-- ============================================================================
CREATE TABLE sms_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT CHECK (purpose IN ('access_code_change', 'phone_verification')) DEFAULT 'access_code_change',
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sms_confirmations IS 'SMS confirmation codes for access code updates';
COMMENT ON COLUMN sms_confirmations.code IS '6-digit numeric code sent via SMS';

-- ============================================================================
-- TABLE: admin_action_logs
-- Purpose: Audit trail of all admin configuration changes
-- ============================================================================
CREATE TABLE admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  source TEXT CHECK (source IN ('web_chat', 'phone_call', 'api')) NOT NULL,
  source_metadata JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_action_logs IS 'Immutable audit trail of all admin configuration changes';
COMMENT ON COLUMN admin_action_logs.source_metadata IS 'IP address, user agent, call SID, etc.';

-- ============================================================================
-- UPDATE: users table
-- Add columns for phone admin access
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_admin_access_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_admin_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_admin_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN users.phone_admin_access_code IS 'Hashed access code for phone-based admin authentication (bcrypt)';
COMMENT ON COLUMN users.phone_admin_locked IS 'Set to TRUE after 3 failed access code attempts';
COMMENT ON COLUMN users.phone_admin_locked_at IS 'Timestamp when phone admin was locked';

-- ============================================================================
-- INDEXES
-- Purpose: Optimize query performance
-- ============================================================================

-- admin_conversations indexes
CREATE INDEX idx_admin_conversations_user_id ON admin_conversations(user_id, started_at DESC);
CREATE INDEX idx_admin_conversations_status ON admin_conversations(status) WHERE status = 'active';

-- admin_messages indexes
CREATE INDEX idx_admin_messages_conversation ON admin_messages(conversation_id, created_at ASC);

-- knowledge_sources indexes
CREATE INDEX idx_knowledge_sources_user ON knowledge_sources(user_id, created_at DESC);
CREATE INDEX idx_knowledge_sources_next_sync ON knowledge_sources(next_sync_at) WHERE sync_status = 'completed';

-- knowledge_chunks indexes
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks(knowledge_source_id, chunk_index);
-- Vector index will be created after data exists (ivfflat requires data)
-- CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- access_code_attempts indexes
CREATE INDEX idx_access_code_attempts_user ON access_code_attempts(user_id, created_at DESC);
CREATE INDEX idx_access_code_attempts_lockout ON access_code_attempts(user_id, created_at DESC) WHERE lockout_triggered = TRUE;

-- sms_confirmations indexes
CREATE INDEX idx_sms_confirmations_user ON sms_confirmations(user_id, created_at DESC);
CREATE INDEX idx_sms_confirmations_expiry ON sms_confirmations(expires_at) WHERE verified = FALSE;

-- admin_action_logs indexes
CREATE INDEX idx_admin_action_logs_user ON admin_action_logs(user_id, created_at DESC);
CREATE INDEX idx_admin_action_logs_type ON admin_action_logs(action_type, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Purpose: Ensure users can only access their own data
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE admin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_code_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

-- admin_conversations policies
CREATE POLICY "Users can view their own conversations"
  ON admin_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON admin_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON admin_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- admin_messages policies
CREATE POLICY "Users can view messages from their conversations"
  ON admin_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM admin_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON admin_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM admin_conversations WHERE user_id = auth.uid()
    )
  );

-- knowledge_sources policies
CREATE POLICY "Users can view their own knowledge sources"
  ON knowledge_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own knowledge sources"
  ON knowledge_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own knowledge sources"
  ON knowledge_sources FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own knowledge sources"
  ON knowledge_sources FOR DELETE
  USING (auth.uid() = user_id);

-- knowledge_chunks policies
CREATE POLICY "Users can view chunks from their knowledge sources"
  ON knowledge_chunks FOR SELECT
  USING (
    knowledge_source_id IN (
      SELECT id FROM knowledge_sources WHERE user_id = auth.uid()
    )
  );

-- Note: INSERT/UPDATE/DELETE for knowledge_chunks managed by service role only
-- Users don't directly manipulate chunks

-- access_code_attempts policies
CREATE POLICY "Users can view their own access code attempts"
  ON access_code_attempts FOR SELECT
  USING (auth.uid() = user_id);

-- Note: INSERT for access_code_attempts managed by service role only

-- sms_confirmations policies
CREATE POLICY "Users can view their own SMS confirmations"
  ON sms_confirmations FOR SELECT
  USING (auth.uid() = user_id);

-- Note: INSERT/UPDATE for sms_confirmations managed by service role only

-- admin_action_logs policies
CREATE POLICY "Users can view their own action logs"
  ON admin_action_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Note: INSERT for admin_action_logs managed by service role only (immutable audit trail)
