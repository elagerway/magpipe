-- Add "inbound only" notification options
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_inbound_calls BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_inbound_messages BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_inbound_calls BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_inbound_messages BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN notification_preferences.email_inbound_calls IS 'Send email for inbound calls only';
COMMENT ON COLUMN notification_preferences.email_inbound_messages IS 'Send email for inbound messages only';
COMMENT ON COLUMN notification_preferences.sms_inbound_calls IS 'Send SMS for inbound calls only';
COMMENT ON COLUMN notification_preferences.sms_inbound_messages IS 'Send SMS for inbound messages only';