-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Email notifications
  email_enabled BOOLEAN DEFAULT false,
  email_address TEXT,
  email_missed_calls BOOLEAN DEFAULT false,
  email_new_messages BOOLEAN DEFAULT false,
  email_voicemails BOOLEAN DEFAULT false,

  -- SMS notifications
  sms_enabled BOOLEAN DEFAULT false,
  sms_phone_number TEXT,
  sms_missed_calls BOOLEAN DEFAULT false,
  sms_new_messages BOOLEAN DEFAULT false,
  sms_voicemails BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Add comments
COMMENT ON TABLE notification_preferences IS 'User notification preferences for email and SMS alerts';
COMMENT ON COLUMN notification_preferences.email_enabled IS 'Master toggle for all email notifications';
COMMENT ON COLUMN notification_preferences.sms_enabled IS 'Master toggle for all SMS notifications';