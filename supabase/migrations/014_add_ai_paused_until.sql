-- Add ai_paused_until column to conversation_contexts table
ALTER TABLE conversation_contexts
ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ;

COMMENT ON COLUMN conversation_contexts.ai_paused_until IS 'Timestamp until which AI responses are paused for this conversation (user interjecting)';