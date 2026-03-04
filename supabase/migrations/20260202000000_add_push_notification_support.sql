-- Add push notification support
-- Migration: 20260202000000_add_push_notification_support.sql

-- Table to store push subscriptions (one user can have multiple devices)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Index for efficient lookup by user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for push_subscriptions
CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions" ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Add push columns to existing notification_preferences table
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS push_inbound_calls BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_all_calls BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS push_inbound_messages BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_all_messages BOOLEAN DEFAULT false;

-- Comments for documentation
COMMENT ON TABLE push_subscriptions IS 'Stores web push notification subscriptions for user devices';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL';
COMMENT ON COLUMN push_subscriptions.p256dh_key IS 'User public key for encryption';
COMMENT ON COLUMN push_subscriptions.auth_key IS 'Authentication secret for encryption';
COMMENT ON COLUMN push_subscriptions.device_name IS 'Optional friendly name for the device';
COMMENT ON COLUMN push_subscriptions.last_used_at IS 'Last time a notification was sent to this subscription';

COMMENT ON COLUMN notification_preferences.push_enabled IS 'Master toggle for push notifications';
COMMENT ON COLUMN notification_preferences.push_inbound_calls IS 'Notify on inbound calls (completed)';
COMMENT ON COLUMN notification_preferences.push_all_calls IS 'Notify on all calls (inbound/outbound, completed/missed)';
COMMENT ON COLUMN notification_preferences.push_inbound_messages IS 'Notify on inbound messages';
COMMENT ON COLUMN notification_preferences.push_all_messages IS 'Notify on all messages (inbound/outbound)';
