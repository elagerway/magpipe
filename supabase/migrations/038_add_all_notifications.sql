-- Add "all calls" and "all messages" notification options
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_all_calls BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_all_messages BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_all_calls BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_all_messages BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN notification_preferences.email_all_calls IS 'Send email for all calls (not just missed)';
COMMENT ON COLUMN notification_preferences.email_all_messages IS 'Send email for all messages (inbound and outbound)';
COMMENT ON COLUMN notification_preferences.sms_all_calls IS 'Send SMS for all calls (not just missed)';
COMMENT ON COLUMN notification_preferences.sms_all_messages IS 'Send SMS for all messages (inbound and outbound)';