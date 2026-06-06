-- Add content_config JSONB to notification_preferences
-- Stores per-channel content settings: which fields to include and optional custom text
-- Structure: { "email": { "fields": [...], "custom_text": "..." }, "sms": {...}, "slack": {...} }
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS content_config JSONB DEFAULT '{}';
