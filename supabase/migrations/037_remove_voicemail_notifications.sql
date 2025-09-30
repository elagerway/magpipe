-- Remove voicemail notification columns
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS email_voicemails;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS sms_voicemails;