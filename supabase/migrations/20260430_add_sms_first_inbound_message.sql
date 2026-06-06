-- Add "first inbound message in a 12-hour window" SMS notification rule
-- When enabled, only notifies on the first inbound SMS from a given sender
-- within the trailing 12 hours, suppressing back-and-forth chatter.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS sms_first_inbound_message BOOLEAN DEFAULT false;

COMMENT ON COLUMN notification_preferences.sms_first_inbound_message IS
  'Send SMS only for the first inbound message from a sender within the last 12 hours';
