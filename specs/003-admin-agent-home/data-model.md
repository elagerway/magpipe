# Data Model: Admin Agent & Home Page Redesign

**Feature**: 003-admin-agent-home
**Date**: 2025-11-05

---

## Entity Relationship Overview

```
users (existing)
  ↓ 1:N
admin_conversations
  ↓ 1:N
admin_messages

users (existing)
  ↓ 1:N
knowledge_sources
  ↓ 1:N
knowledge_chunks

users (existing)
  ↓ 1:N
access_code_attempts

users (existing)
  ↓ 1:N
admin_action_logs
```

---

## Entities

### 1. admin_conversations

**Purpose**: Track ongoing conversations between user and admin agent on homepage

**Fields**:
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL
- `status` TEXT CHECK (status IN ('active', 'completed', 'abandoned')) DEFAULT 'active'
- `started_at` TIMESTAMPTZ DEFAULT NOW()
- `last_message_at` TIMESTAMPTZ DEFAULT NOW()
- `context` JSONB DEFAULT '{}'::jsonb
  - Stores conversation context for agent (pending changes, clarification questions)
  - Example: `{"pending_prompt_update": "Be more friendly", "awaiting_confirmation": true}`
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_admin_conversations_user_id` ON (user_id, started_at DESC)
- `idx_admin_conversations_status` ON (status) WHERE status = 'active'

**RLS Policy**:
- Users can SELECT, INSERT, UPDATE their own conversations only
- Service role has full access

**State Transitions**:
- `active` → `completed` (user ends conversation or completes task)
- `active` → `abandoned` (no activity for 24 hours)

---

### 2. admin_messages

**Purpose**: Store individual messages in admin conversations for history display

**Fields**:
- `id` UUID PRIMARY KEY
- `conversation_id` UUID REFERENCES admin_conversations(id) ON DELETE CASCADE NOT NULL
- `role` TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL
- `content` TEXT NOT NULL
- `function_call` JSONB
  - Stores OpenAI function call data if message triggered an action
  - Example: `{"name": "update_system_prompt", "arguments": {"new_prompt": "..."}}`
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_admin_messages_conversation` ON (conversation_id, created_at ASC)

**RLS Policy**:
- Users can SELECT messages from their own conversations
- Users can INSERT messages to their own conversations
- Service role has full access

---

### 3. knowledge_sources

**Purpose**: Track URLs added to user's knowledge base for call/SMS agent

**Fields**:
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL
- `url` TEXT NOT NULL
- `title` TEXT
  - Extracted from page `<title>` tag or Readability metadata
- `description` TEXT
  - First paragraph or meta description
- `sync_period` TEXT CHECK (sync_period IN ('24h', '7d', '1mo', '3mo')) DEFAULT '7d'
- `sync_status` TEXT CHECK (sync_status IN ('pending', 'syncing', 'completed', 'failed')) DEFAULT 'pending'
- `last_synced_at` TIMESTAMPTZ
- `next_sync_at` TIMESTAMPTZ
- `error_message` TEXT
  - Populated if sync_status = 'failed'
- `chunk_count` INTEGER DEFAULT 0
  - Number of chunks generated from this source
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_knowledge_sources_user` ON (user_id, created_at DESC)
- `idx_knowledge_sources_next_sync` ON (next_sync_at) WHERE sync_status = 'completed'

**RLS Policy**:
- Users can SELECT, INSERT, UPDATE, DELETE their own knowledge sources
- Service role has full access

**State Transitions**:
- `pending` → `syncing` (background job picks up)
- `syncing` → `completed` (chunks generated successfully)
- `syncing` → `failed` (error during fetch/processing)
- `completed` → `syncing` (re-sync triggered manually or by schedule)

**Validation Rules**:
- URL must start with `http://` or `https://`
- URL max length: 2048 characters
- Title max length: 500 characters
- User can have max 50 knowledge sources (enforced in application layer)

---

### 4. knowledge_chunks

**Purpose**: Store chunked content with vector embeddings for semantic search

**Fields**:
- `id` UUID PRIMARY KEY
- `knowledge_source_id` UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE NOT NULL
- `content` TEXT NOT NULL
  - Plain text chunk (500-1000 tokens)
- `embedding` vector(1536) NOT NULL
  - OpenAI text-embedding-3-small (1536 dimensions)
- `chunk_index` INTEGER NOT NULL
  - Position in original document (0-based)
- `metadata` JSONB DEFAULT '{}'::jsonb
  - Optional: Heading context, URL fragment, etc.
- `token_count` INTEGER
  - Approximate token count for this chunk
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_knowledge_chunks_source` ON (knowledge_source_id, chunk_index)
- `idx_knowledge_chunks_embedding` USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  - IVFFlat index for fast cosine similarity search

**RLS Policy**:
- Users can SELECT chunks from their own knowledge sources (via JOIN)
- Service role has full access
- Users cannot directly INSERT/UPDATE/DELETE chunks (managed by sync process)

**Vector Search Query Pattern**:
```sql
SELECT kc.content, kc.metadata, ks.url, ks.title,
       1 - (kc.embedding <=> $1::vector) AS similarity
FROM knowledge_chunks kc
JOIN knowledge_sources ks ON kc.knowledge_source_id = ks.id
WHERE ks.user_id = $2
ORDER BY kc.embedding <=> $1::vector
LIMIT 5;
```

---

### 5. access_code_attempts

**Purpose**: Track phone admin access code verification attempts for rate limiting and security

**Fields**:
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL
- `phone_number` TEXT NOT NULL
  - Caller ID from SIP metadata
- `success` BOOLEAN NOT NULL
- `input_received` TEXT
  - Voice transcription of what user said (for debugging)
  - NULL if user hung up before providing code
- `ip_address` INET
  - NULL for phone calls, populated for web-based admin
- `user_agent` TEXT
  - NULL for phone calls
- `lockout_triggered` BOOLEAN DEFAULT FALSE
  - Set to TRUE when 3rd failed attempt triggers lockout
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_access_code_attempts_user` ON (user_id, created_at DESC)
- `idx_access_code_attempts_lockout` ON (user_id, created_at DESC) WHERE lockout_triggered = TRUE

**RLS Policy**:
- Users can SELECT their own attempts only
- Service role has full access
- Users cannot INSERT/UPDATE/DELETE (managed by verification function)

**Validation Rules**:
- Phone number must match E.164 format
- Old attempts (>30 days) automatically purged by cron job

---

### 6. sms_confirmations

**Purpose**: Track SMS confirmation codes for access code changes

**Fields**:
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL
- `phone_number` TEXT NOT NULL
- `code` TEXT NOT NULL
  - 6-digit numeric code (stored as text to preserve leading zeros)
- `purpose` TEXT CHECK (purpose IN ('access_code_change', 'phone_verification')) DEFAULT 'access_code_change'
- `verified` BOOLEAN DEFAULT FALSE
- `attempts` INTEGER DEFAULT 0
  - Number of verification attempts
- `expires_at` TIMESTAMPTZ NOT NULL
  - 5 minutes from creation
- `verified_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_sms_confirmations_user` ON (user_id, created_at DESC)
- `idx_sms_confirmations_expiry` ON (expires_at) WHERE verified = FALSE

**RLS Policy**:
- Users can SELECT their own confirmations only
- Service role has full access
- Users cannot directly INSERT/UPDATE/DELETE (managed by confirmation functions)

**Validation Rules**:
- Code must be exactly 6 digits
- Max 3 verification attempts per confirmation
- Expired confirmations (>5 minutes) cannot be verified
- Auto-cleanup of old confirmations (>24 hours) via cron

---

### 7. admin_action_logs

**Purpose**: Audit trail of all admin configuration changes for security and debugging

**Fields**:
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL
- `action_type` TEXT NOT NULL
  - Examples: 'update_system_prompt', 'add_knowledge_source', 'change_access_code'
- `description` TEXT NOT NULL
  - Human-readable description of what changed
- `old_value` JSONB
  - Previous state (if applicable)
- `new_value` JSONB
  - New state
- `source` TEXT CHECK (source IN ('web_chat', 'phone_call', 'api')) NOT NULL
- `source_metadata` JSONB
  - IP address, user agent, call SID, etc.
- `success` BOOLEAN NOT NULL
- `error_message` TEXT
  - Populated if success = FALSE
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Indexes**:
- `idx_admin_action_logs_user` ON (user_id, created_at DESC)
- `idx_admin_action_logs_type` ON (action_type, created_at DESC)

**RLS Policy**:
- Users can SELECT their own action logs only
- Service role has full access
- Users cannot INSERT/UPDATE/DELETE (managed by admin functions)

---

## Updates to Existing Tables

### users table

**New Columns** (add via migration):
- `phone_admin_access_code` TEXT
  - Hashed with bcrypt
  - NULL if user hasn't set up phone admin
- `phone_admin_locked` BOOLEAN DEFAULT FALSE
  - Set to TRUE after 3 failed access code attempts
  - Reset to FALSE when user changes access code via web
- `phone_admin_locked_at` TIMESTAMPTZ
  - Timestamp when lock was triggered
  - Used for audit trail

**No Breaking Changes**: All new columns are nullable or have defaults

---

## Database Migration Structure

```sql
-- Migration: 0XX_admin_agent_schema.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables in dependency order
CREATE TABLE admin_conversations (...);
CREATE TABLE admin_messages (...);
CREATE TABLE knowledge_sources (...);
CREATE TABLE knowledge_chunks (...);
CREATE TABLE access_code_attempts (...);
CREATE TABLE sms_confirmations (...);
CREATE TABLE admin_action_logs (...);

-- Add columns to existing users table
ALTER TABLE users
  ADD COLUMN phone_admin_access_code TEXT,
  ADD COLUMN phone_admin_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN phone_admin_locked_at TIMESTAMPTZ;

-- Create indexes
CREATE INDEX idx_admin_conversations_user_id ON admin_conversations(user_id, started_at DESC);
-- ... (all indexes from entity definitions above)

-- Create vector index (requires data before creating)
-- This will be run after initial sync, not in migration
-- CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS on all new tables
ALTER TABLE admin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_code_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- (See individual entity sections above for policy details)
```

---

## Data Flow Examples

### Example 1: User Adds Knowledge Source

1. User types in chat: "Add knowledge from https://example.com/docs"
2. Admin agent calls `add_knowledge_source` function
3. Edge Function creates record in `knowledge_sources` table (status='pending')
4. Background job picks up pending sources
5. Job fetches URL, extracts content, chunks text
6. Job generates embeddings via OpenAI API
7. Job creates records in `knowledge_chunks` table
8. Job updates `knowledge_sources.sync_status` = 'completed'
9. Admin agent confirms to user: "Added knowledge from Example Docs (25 chunks)"

### Example 2: User Changes Access Code via Phone

1. User calls their service number
2. Agent verifies caller ID matches user's phone
3. Agent asks: "Is this [name]?" → User: "Yes"
4. Agent says: "Please say your current access code"
5. User speaks code → LiveKit agent transcribes
6. Agent queries `users` table, verifies hashed code matches
7. If match: Agent says "Please say your new access code"
8. User speaks new code
9. Agent sends SMS confirmation code via Postmark
10. Agent says: "Check your phone for confirmation code"
11. User speaks 6-digit code from SMS
12. Agent verifies code in `sms_confirmations` table
13. Agent updates `users.phone_admin_access_code` with new hashed code
14. Agent logs action to `admin_action_logs`
15. Agent confirms: "Access code updated successfully"

### Example 3: Vector Search During Call

1. Customer calls and asks: "What are your hours?"
2. Call handler agent receives question
3. Agent generates embedding for "What are your hours?"
4. Agent performs vector search on `knowledge_chunks` (cosine similarity)
5. Top 3 chunks returned (from different knowledge sources)
6. Agent includes chunk content in context for GPT-4
7. Agent responds: "We're open Monday-Friday 9am-5pm" (from knowledge base)

---

## Performance Considerations

### Indexes
- All foreign keys have indexes for JOIN performance
- Timestamp columns used in WHERE clauses have DESC indexes
- Vector index uses IVFFlat (faster than exact search, 95%+ recall)

### Partitioning (Future)
- `admin_messages` could be partitioned by month if volume exceeds 10M rows
- `access_code_attempts` could be partitioned by week for faster queries

### Cleanup Jobs
- Delete `admin_conversations` with status='abandoned' older than 90 days
- Delete `access_code_attempts` older than 30 days
- Delete `sms_confirmations` older than 24 hours
- Archive `admin_action_logs` older than 1 year to cold storage

---

## Security Notes

1. **Access Codes**: NEVER store in plain text. Always hash with bcrypt (cost factor 12).
2. **SMS Confirmations**: Generate cryptographically secure random codes (`crypto.randomInt()`).
3. **RLS Policies**: Enforce user_id checks on ALL tables. Service role bypasses RLS for admin functions.
4. **Embeddings**: No sensitive data should be embedded. Sanitize content before embedding.
5. **Audit Logs**: Immutable (users cannot delete/update). Retain indefinitely for compliance.

---

**Status**: ✅ Data model complete, ready for contract generation
