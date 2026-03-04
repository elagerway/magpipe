-- Fix all existing outbound messages to be marked as AI-generated
-- All outbound messages that exist now were from AI (user-sent feature just deployed)
UPDATE sms_messages
SET is_ai_generated = true
WHERE direction = 'outbound'
AND is_ai_generated = false;