-- Add agent_id to tracking tables (call_records, sms_messages, conversation_contexts)
-- Migration: 20260130000002_tracking_agent_id.sql

-- Add agent_id to call_records
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_records_agent_id ON call_records(agent_id);

COMMENT ON COLUMN call_records.agent_id IS 'The agent that handled this call';

-- Add agent_id to sms_messages
ALTER TABLE sms_messages
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_agent_id ON sms_messages(agent_id);

COMMENT ON COLUMN sms_messages.agent_id IS 'The agent that handled this SMS';

-- Add agent_id to conversation_contexts for agent-specific memory
ALTER TABLE conversation_contexts
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_contexts_agent_id ON conversation_contexts(agent_id);

-- Remove the unique constraint on contact_id alone since we now need uniqueness on (contact_id, agent_id)
-- First check if the constraint exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_contexts_contact_id_key') THEN
        ALTER TABLE conversation_contexts DROP CONSTRAINT conversation_contexts_contact_id_key;
    END IF;
END $$;

-- Create a new unique constraint for contact_id + agent_id combination
-- This allows different agents to have separate memory for the same contact
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_contexts_contact_agent
ON conversation_contexts(contact_id, COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMENT ON COLUMN conversation_contexts.agent_id IS 'The agent this conversation context belongs to (NULL = shared/legacy context)';
