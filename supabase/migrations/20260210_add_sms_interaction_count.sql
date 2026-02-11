-- Add SMS interaction count to conversation_contexts
-- Tracks SMS exchanges separately from call interactions
ALTER TABLE conversation_contexts ADD COLUMN IF NOT EXISTS sms_interaction_count INTEGER DEFAULT 0;
