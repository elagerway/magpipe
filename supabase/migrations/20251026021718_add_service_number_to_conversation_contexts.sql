-- Add user_id, contact_phone, and service_number to conversation_contexts for SMS threading
-- This allows separate conversation threads when the same contact texts different service numbers

-- Add user_id column (needed for direct user association)
ALTER TABLE conversation_contexts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add contact_phone column (direct phone number reference for faster queries)
ALTER TABLE conversation_contexts
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Add service_number column (the service number being texted, for multi-number threading)
ALTER TABLE conversation_contexts
ADD COLUMN IF NOT EXISTS service_number TEXT;

-- Populate user_id from existing contact_id relationships
UPDATE conversation_contexts cc
SET user_id = c.user_id
FROM contacts c
WHERE cc.contact_id = c.id
AND cc.user_id IS NULL;

-- Populate contact_phone from existing contact_id relationships
UPDATE conversation_contexts cc
SET contact_phone = c.phone_number
FROM contacts c
WHERE cc.contact_id = c.id
AND cc.contact_phone IS NULL;

-- Now make contact_id nullable since we have direct user_id and contact_phone
ALTER TABLE conversation_contexts
ALTER COLUMN contact_id DROP NOT NULL;

-- Drop the old unique constraint on contact_id if it exists
ALTER TABLE conversation_contexts
DROP CONSTRAINT IF EXISTS conversation_contexts_contact_id_key;

-- Create a new unique constraint on (user_id, contact_phone, service_number)
-- This ensures each combination of user + contact + service number has one conversation
ALTER TABLE conversation_contexts
ADD CONSTRAINT conversation_contexts_user_id_contact_phone_service_number_key
UNIQUE (user_id, contact_phone, service_number);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_user_id
ON conversation_contexts(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_contexts_contact_phone
ON conversation_contexts(contact_phone);

CREATE INDEX IF NOT EXISTS idx_conversation_contexts_service_number
ON conversation_contexts(service_number);

COMMENT ON COLUMN conversation_contexts.user_id IS 'Direct reference to user (faster than joining through contacts)';
COMMENT ON COLUMN conversation_contexts.contact_phone IS 'Phone number of the contact (faster than joining through contacts)';
COMMENT ON COLUMN conversation_contexts.service_number IS 'The service phone number this conversation is associated with (enables separate threads per number)';
